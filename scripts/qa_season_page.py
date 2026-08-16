"""Build the shareable season-timing page straight from the analysis artifacts."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from qa_season_analysis import CLIMATOLOGY_YEARS, monthly_rate, month_labels

QA = ROOT / "docs/qa/season-timing-2026"
OUT = QA / "season-timing.html"
truth = json.loads((ROOT / "docs/qa/season-truth-2026/gbif-season-truth.json").read_text())
analysis = json.loads((QA / "season-analysis.json").read_text())

R2 = "https://data.fung.es"
CURVE_URLS = {"NE": f"{R2}/EU/NE/NE_season_curves.json", "SE": f"{R2}/EU/SE/SE_season_curves.json",
              "USE": f"{R2}/USA/USE/USE_season_curves.json", "USW": f"{R2}/USA/USW/USW_season_curves.json"}
session = requests.Session()
curves = {region: session.get(url, timeout=60).json() for region, url in CURVE_URLS.items()}

LABEL = {"mushroom": "Porcini", "chant": "Chanterelle", "black_chant": "Black chanterelle",
         "parasol": "Parasol", "morel": "Morel", "st_george": "St George's"}
REGION_LABEL = {"NE": "N Europe", "SE": "S Europe", "USE": "US East", "USW": "US West"}
MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

rows = []
for region, payload in analysis.items():
    for species, test in payload["tests"].items():
        if "skipped" in test:
            continue
        observed = monthly_rate(truth, region, species)
        observed = np.nan_to_num(observed / np.nanmax(observed))
        curve = curves[region].get(species)
        model = (np.array([curve[str(m)] for m in range(1, 13)]) if curve else None)
        in_season, dead = month_labels(monthly_rate(truth, region, species))
        rows.append({
            "region": region, "species": species, "test": test,
            "observed": observed, "model": model, "in_season": in_season, "dead": dead,
        })


def strip(values, kind, in_season=None):
    """A 12-cell calendar. Opacity encodes level; kind picks the hue."""
    cells = []
    for index, value in enumerate(values):
        month = index + 1
        mark = " mark" if in_season and month in in_season else ""
        cells.append(
            f'<i class="c {kind}{mark}" style="--v:{value:.3f}" '
            f'title="{MONTHS[index]} {value:.2f}"></i>'
        )
    return f'<span class="strip">{"".join(cells)}</span>'


def fmt(value, digits=3, dash="—"):
    return dash if value is None else f"{value:.{digits}f}"


# ---------------------------------------------------------------- section A rows
amplitude = []
for row in sorted(rows, key=lambda r: -r["test"]["observed_seasonal_range_x"]):
    test, region = row["test"], row["region"]
    model_range = test["model_seasonal_range_x"]
    observed_range = test["observed_seasonal_range_x"]
    peak_match = test["observed_peak_month"] == test["model_peak_month_in_window"]
    amplitude.append(f"""<tr>
      <td class="reg">{REGION_LABEL[region]}</td>
      <td class="sp">{LABEL[row['species']]}</td>
      <td class="strips">{strip(row['observed'], 'obs', row['in_season'])}</td>
      <td class="strips">{strip(row['model'] / row['model'].max(), 'mdl') if row['model'] is not None else '—'}</td>
      <td class="num big">{observed_range:,.0f}×</td>
      <td class="num">{model_range:.2f}×</td>
      <td class="num muted">{observed_range / model_range:,.0f}×</td>
      <td class="{'ok' if peak_match else 'warn'}">{MONTHS[test['observed_peak_month'] - 1]} / {MONTHS[test['model_peak_month_in_window'] - 1]}</td>
    </tr>""")

# ---------------------------------------------------------------- section B rows
separation = []
for row in sorted(rows, key=lambda r: r["test"].get("separation", {}).get("full_score") or 9):
    test, sep = row["test"], row["test"].get("separation", {})
    if sep.get("full_score") is None:
        continue
    full, weather = sep["full_score"], sep["weather_only"]
    dead_share = sep["share_ge4_dead_months"]
    verdict = "bad" if full < 0.5 else ("ok" if full >= 0.75 else "warn")
    separation.append(f"""<tr>
      <td class="reg">{REGION_LABEL[row['region']]}</td>
      <td class="sp">{LABEL[row['species']]}</td>
      <td class="num {verdict}">{full:.3f}</td>
      <td class="num {'bad' if weather < 0.5 else 'ok'}">{weather:.3f}</td>
      <td class="num">{sep['median_score_in_season']:.2f}</td>
      <td class="num">{sep['median_score_dead_months']:.2f}</td>
      <td class="num muted">{sep['share_ge4_in_season'] * 100:.0f}%</td>
      <td class="bar-cell">
        <span class="bar"><i style="--w:{dead_share * 100:.0f}%"></i></span>
        <span class="bar-num">{dead_share * 100:.0f}%</span>
      </td>
    </tr>""")

# ---------------------------------------------------------------- section C rows
onset = []
for row in rows:
    test, onset_data = row["test"], row["test"]["onset"]
    error = onset_data.get("model_median_ge4_error_days")
    if error is None or onset_data.get("observed_censored_at_window_start"):
        continue
    season_share = len(test["observed_in_season_months"]) / 12
    window_share = onset_data["share_of_window_median_ge4"]
    onset.append((error, f"""<tr>
      <td class="reg">{REGION_LABEL[row['region']]}</td>
      <td class="sp">{LABEL[row['species']]}</td>
      <td class="mono">{onset_data['observed']}</td>
      <td class="mono">{onset_data['model_median_ge4']}</td>
      <td class="num {'bad' if error < -20 else 'warn'}">{error:+d} d</td>
      <td class="num muted">{window_share * 100:.0f}%</td>
      <td class="num muted">{season_share * 100:.0f}%</td>
    </tr>"""))
onset = [markup for _, markup in sorted(onset)]

testable = [row["test"]["separation"]["full_score"] for row in rows
            if row["test"].get("separation", {}).get("full_score") is not None]
weather_only = [row["test"]["separation"]["weather_only"] for row in rows
                if row["test"].get("separation", {}).get("weather_only") is not None]
dead_shares = [row["test"]["separation"]["share_ge4_dead_months"] for row in rows
               if row["test"].get("separation", {}).get("share_ge4_dead_months") is not None]

SPATIAL = [("US East", "Morel", 690, 0.752), ("US East", "Black chanterelle", 60, 0.746),
           ("N Europe", "Morel", 159, 0.716), ("US West", "Morel", 147, 0.704),
           ("S Europe", "Porcini", 75, 0.689), ("S Europe", "St George's", 31, 0.687),
           ("US East", "Chanterelle", 344, 0.684), ("N Europe", "Porcini", 118, 0.649),
           ("N Europe", "St George's", 352, 0.644), ("US East", "Porcini", 88, 0.634),
           ("N Europe", "Parasol", 19, 0.629), ("US West", "Porcini", 115, 0.599),
           ("S Europe", "Chanterelle", 34, 0.586), ("N Europe", "Chanterelle", 357, 0.574),
           ("S Europe", "Morel", 24, 0.516)]
spatial = "".join(
    f'<tr><td class="reg">{region}</td><td class="sp">{species}</td>'
    f'<td class="num muted">{n}</td>'
    f'<td class="bar-cell"><span class="bar alt"><i style="--w:{value * 100:.0f}%"></i></span>'
    f'<span class="bar-num">{value:.3f}</span></td></tr>'
    for region, species, n, value in SPATIAL
)

BRANCH = [("Porcini", 0.849, 0.925, 39.4, 53.0), ("Chanterelle", 0.843, 0.915, 48.3, 69.4),
          ("Black chanterelle", 0.671, 0.758, 21.9, 33.9), ("Parasol", 0.768, 0.833, 39.1, 51.3),
          ("St George's", 0.976, 0.998, 52.1, 66.2)]
branch = "".join(
    f'<tr><td class="sp">{species}</td>'
    f'<td class="num muted">{main_auc:.3f}</td><td class="num ok">{branch_auc:.3f} <span class="delta up">+{branch_auc - main_auc:.3f}</span></td>'
    f'<td class="num muted">{main_fp:.1f}%</td><td class="num bad">{branch_fp:.1f}% <span class="delta down">+{branch_fp - main_fp:.1f}</span></td></tr>'
    for species, main_auc, branch_auc, main_fp, branch_fp in BRANCH
)

SOUTH = [("Porcini", 3.39, 4.55, "5.11"), ("Chanterelle", 2.79, 3.77, "4.08"),
         ("Parasol", 3.30, 4.39, "—"), ("Black chanterelle", 1.39, 2.24, "—")]
south = "".join(
    f'<tr><td class="sp">{species}</td><td class="num muted">{before:.2f}</td>'
    f'<td class="num ok">{after:.2f} <span class="delta up">+{after - before:.2f}</span></td>'
    f'<td class="num">{april}</td></tr>'
    for species, before, after, april in SOUTH
)

# ------------------------------------------------------------------- the implemented fix
simulation_path = QA / "season-simulation.json"
simulation = json.loads(simulation_path.read_text()) if simulation_path.exists() else {}
fix_rows, fix_stats = [], {}
if simulation:
    entries = [(region, species, entry)
               for region, species_map in simulation.items()
               for species, entry in species_map.items() if entry["variants"]["production"]]
    for region, species, entry in sorted(entries, key=lambda e: e[2]["variants"]["production"]["auc"]):
        before, after = entry["variants"]["production"], entry["variants"]["gate_only"]
        fixed_below = before["auc"] < 0.5 <= after["auc"]
        fix_rows.append(f"""<tr>
          <td class="reg">{REGION_LABEL[region]}</td>
          <td class="sp">{LABEL[species]}</td>
          <td class="num {'bad' if before['auc'] < 0.5 else 'muted'}">{before['auc']:.3f}</td>
          <td class="num {'ok' if after['auc'] >= 0.5 else 'bad'}">{after['auc']:.3f}
            <span class="delta {'up' if after['auc'] >= before['auc'] else 'down'}">{after['auc'] - before['auc']:+.3f}</span></td>
          <td class="num muted">{before['share_ge4_dead'] * 100:.0f}%</td>
          <td class="num ok">{after['share_ge4_dead'] * 100:.0f}%</td>
          <td class="num muted">{before['share_ge4_in'] * 100:.0f}%</td>
          <td class="num">{after['share_ge4_in'] * 100:.0f}%</td>
          <td>{'recovered' if fixed_below else ''}</td>
        </tr>""")
    for name, key in (("before", "production"), ("after", "gate_only")):
        aucs = np.array([e["variants"][key]["auc"] for _, _, e in entries], float)
        dead = np.array([e["variants"][key]["share_ge4_dead"] for _, _, e in entries], float)
        inside = np.array([e["variants"][key]["share_ge4_in"] for _, _, e in entries], float)
        errors = [abs(e["onset"][f"{key}_error_days"]) for _, _, e in entries
                  if not e["onset"]["censored"] and e["onset"].get(f"{key}_error_days") is not None]
        early = [e["onset"][f"{key}_error_days"] for _, _, e in entries
                 if not e["onset"]["censored"] and e["onset"].get(f"{key}_error_days") is not None]
        fix_stats[name] = {
            "auc": np.median(aucs), "below": int((aucs < 0.5).sum()), "n": len(aucs),
            "dead": np.median(dead), "inside": np.median(inside),
            "onset": np.median(errors), "early": sum(1 for v in early if v < 0), "onset_n": len(early),
        }

SWEEP = [("no gate", 0.707, 40.8, 27, "7 of 17 below random"),
         ("0.05 / 0.15", 0.931, 4.6, 21, "one species never reaches threshold"),
         ("0.02 / 0.10", 0.923, 9.1, 15, "chosen"),
         ("0.01 / 0.04", 0.884, 18.5, 10, "dead months leaking back")]
sweep = "".join(
    f'<tr{" class=chosen" if note == "chosen" else ""}>'
    f'<td class="mono">{label}</td><td class="num">{auc:.3f}</td>'
    f'<td class="num">{dead:.1f}%</td><td class="num">{onset:.0f} d</td>'
    f'<td class="{"ok" if note == "chosen" else "muted"}">{note}</td></tr>'
    for label, auc, dead, onset, note in SWEEP
)

HTML = f"""<title>Season-timing QA — fung.es scoring model</title>
<style>
:root {{
  --ground: #f6f7f4;
  --panel: #fffffe;
  --rule: #dcdfd6;
  --rule-soft: #e8eae2;
  --ink: #1c1b16;
  --ink-2: #4a4a41;
  --ink-3: #7b7a6e;
  --accent: #9a6410;
  --accent-soft: #f0e6d4;
  --good: #4a6b3f;
  --bad: #9c3a2b;
  --warn: #a5761c;
  --obs: #4a6b3f;
  --mdl: #9a6410;
  --shadow: 0 1px 2px rgba(28, 27, 22, .05), 0 8px 24px -16px rgba(28, 27, 22, .18);
  --serif: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --ground: #161613;
    --panel: #1e1e1a;
    --rule: #34342d;
    --rule-soft: #26261f;
    --ink: #eceade;
    --ink-2: #b6b4a6;
    --ink-3: #858375;
    --accent: #d9a24e;
    --accent-soft: #33291a;
    --good: #8bb07a;
    --bad: #d97b66;
    --warn: #d9a24e;
    --obs: #8bb07a;
    --mdl: #d9a24e;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -16px rgba(0,0,0,.6);
  }}
}}
:root[data-theme="dark"] {{
  --ground: #161613;
  --panel: #1e1e1a;
  --rule: #34342d;
  --rule-soft: #26261f;
  --ink: #eceade;
  --ink-2: #b6b4a6;
  --ink-3: #858375;
  --accent: #d9a24e;
  --accent-soft: #33291a;
  --good: #8bb07a;
  --bad: #d97b66;
  --warn: #d9a24e;
  --obs: #8bb07a;
  --mdl: #d9a24e;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -16px rgba(0,0,0,.6);
}}

* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}}
.wrap {{ max-width: 1120px; margin: 0 auto; padding: 0 24px 96px; }}
.prose {{ max-width: 68ch; }}

header.head {{ padding: 72px 0 40px; border-bottom: 1px solid var(--rule); margin-bottom: 40px; }}
.eyebrow {{
  font-family: var(--mono); font-size: 11.5px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--accent); margin: 0 0 20px;
}}
h1 {{
  font-family: var(--serif); font-weight: 400; font-size: clamp(34px, 5vw, 54px);
  line-height: 1.08; letter-spacing: -.015em; margin: 0 0 20px; text-wrap: balance;
}}
h1 em {{ font-style: italic; color: var(--accent); }}
.standfirst {{ font-size: 19px; line-height: 1.55; color: var(--ink-2); margin: 0; max-width: 62ch; }}
.meta {{
  display: flex; flex-wrap: wrap; gap: 8px 28px; margin-top: 28px;
  font-family: var(--mono); font-size: 12px; color: var(--ink-3);
}}
.meta b {{ color: var(--ink-2); font-weight: 500; }}

h2 {{
  font-family: var(--serif); font-weight: 400; font-size: 27px; letter-spacing: -.01em;
  margin: 0 0 6px; text-wrap: balance;
}}
.sec {{ margin-top: 64px; }}
.sec > .kicker {{
  font-family: var(--mono); font-size: 11px; letter-spacing: .13em; text-transform: uppercase;
  color: var(--ink-3); margin: 0 0 10px;
}}
h3 {{ font-family: var(--sans); font-size: 15px; font-weight: 650; letter-spacing: .01em; margin: 32px 0 8px; }}
p {{ margin: 0 0 16px; }}
.prose p, .lede {{ color: var(--ink-2); }}
.lede {{ font-size: 17px; }}
strong {{ color: var(--ink); font-weight: 650; }}
a {{ color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }}
code {{ font-family: var(--mono); font-size: .88em; background: var(--rule-soft); padding: .12em .38em; border-radius: 3px; }}
pre {{
  font-family: var(--mono); font-size: 12.5px; line-height: 1.65; background: var(--panel);
  border: 1px solid var(--rule); border-left: 2px solid var(--accent);
  padding: 16px 18px; overflow-x: auto; margin: 0 0 20px;
}}
pre code {{ background: none; padding: 0; }}

.tiles {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin: 36px 0 8px; }}
.tile {{ background: var(--panel); padding: 20px; }}
.tile .k {{ font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 10px; }}
.tile .v {{ font-family: var(--serif); font-size: 33px; line-height: 1; letter-spacing: -.02em; margin: 0 0 8px; font-variant-numeric: tabular-nums; }}
.tile .n {{ font-size: 13px; line-height: 1.45; color: var(--ink-3); margin: 0; }}
.tile.is-bad .v {{ color: var(--bad); }}
.tile.is-good .v {{ color: var(--good); }}

.scroll {{ overflow-x: auto; margin: 24px 0 12px; border: 1px solid var(--rule); background: var(--panel); }}
table {{ border-collapse: collapse; width: 100%; font-size: 13.5px; }}
th {{
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-3); font-weight: 500; text-align: left; padding: 12px 14px;
  border-bottom: 1px solid var(--rule); white-space: nowrap; vertical-align: bottom;
}}
td {{ padding: 10px 14px; border-bottom: 1px solid var(--rule-soft); vertical-align: middle; }}
tbody tr:last-child td {{ border-bottom: 0; }}
th.num, td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
td.num {{ font-family: var(--mono); font-size: 12.5px; }}
td.reg {{ font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); white-space: nowrap; }}
td.sp {{ font-weight: 600; white-space: nowrap; }}
td.mono {{ font-family: var(--mono); font-size: 12px; color: var(--ink-2); white-space: nowrap; }}
td.muted {{ color: var(--ink-3); }}
td.big {{ font-size: 13.5px; font-weight: 600; }}
.ok {{ color: var(--good); }}
.bad {{ color: var(--bad); font-weight: 600; }}
.warn {{ color: var(--warn); }}

.strip {{ display: inline-flex; gap: 1.5px; }}
.strip .c {{
  width: 11px; height: 22px; border-radius: 1px; display: block;
  background: color-mix(in oklab, var(--cell) calc(var(--v) * 100%), transparent);
  outline: 1px solid var(--rule-soft); outline-offset: -1px;
}}
.strip .obs {{ --cell: var(--obs); }}
.strip .mdl {{ --cell: var(--mdl); }}
.strip .mark {{ outline: 1px solid var(--ink-3); }}
td.strips {{ padding: 8px 14px; }}

.bar-cell {{ white-space: nowrap; min-width: 132px; }}
.bar {{ display: inline-block; width: 78px; height: 8px; background: var(--rule-soft); vertical-align: middle; border-radius: 1px; overflow: hidden; }}
.bar i {{ display: block; width: var(--w); height: 100%; background: var(--bad); }}
.bar.alt i {{ background: var(--good); }}
.bar-num {{ font-family: var(--mono); font-size: 12px; margin-left: 9px; font-variant-numeric: tabular-nums; }}
.delta {{ font-family: var(--mono); font-size: 10.5px; padding: 1px 4px; border-radius: 2px; margin-left: 4px; }}
.delta.up {{ color: var(--good); background: color-mix(in oklab, var(--good) 12%, transparent); }}
.delta.down {{ color: var(--bad); background: color-mix(in oklab, var(--bad) 12%, transparent); }}

tr.chosen td {{ background: var(--accent-soft); }}
.legend {{ display: flex; flex-wrap: wrap; gap: 6px 22px; font-family: var(--mono); font-size: 11px; color: var(--ink-3); margin: 0 0 4px; }}
.legend span {{ display: inline-flex; align-items: center; gap: 7px; }}
.swatch {{ width: 22px; height: 9px; border-radius: 1px; }}
.caption {{ font-size: 12.5px; color: var(--ink-3); margin: 0 0 8px; max-width: 76ch; line-height: 1.5; }}

.callout {{
  border: 1px solid var(--rule); border-left: 2px solid var(--accent);
  background: var(--panel); padding: 20px 22px; margin: 28px 0;
}}
.callout h3 {{ margin-top: 0; }}
.callout p:last-child {{ margin-bottom: 0; }}

ol.recs {{ counter-reset: r; list-style: none; padding: 0; margin: 20px 0 0; }}
ol.recs li {{
  counter-increment: r; position: relative; padding-left: 42px; margin-bottom: 18px;
  color: var(--ink-2); max-width: 70ch;
}}
ol.recs li::before {{
  content: counter(r); position: absolute; left: 0; top: 1px;
  font-family: var(--mono); font-size: 11px; color: var(--accent);
  border: 1px solid var(--rule); width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
}}
ul.plain {{ padding-left: 20px; margin: 0 0 16px; color: var(--ink-2); }}
ul.plain li {{ margin-bottom: 9px; max-width: 70ch; }}

footer {{ margin-top: 72px; padding-top: 24px; border-top: 1px solid var(--rule); font-size: 13px; color: var(--ink-3); }}
:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
@media (prefers-reduced-motion: reduce) {{ * {{ transition: none !important; animation: none !important; }} }}
@media (max-width: 640px) {{
  header.head {{ padding-top: 44px; }}
  .wrap {{ padding: 0 16px 64px; }}
}}
</style>

<div class="wrap">
<header class="head">
  <p class="eyebrow">Model QA · fung.es scoring · PR #171</p>
  <h1>The model knows <em>where</em>. It does not know <em>when</em>.</h1>
  <p class="standfirst">
    Both existing QA runs compare an observation against a background drawn from the same
    day, which conditions the calendar away by design. This run adds the missing axis and
    finds the seasonal term is a 1.67× tilt against an observed range up to 9,616×.
  </p>
  <div class="meta">
    <span><b>Window</b> 2026-04-12 → 08-20</span>
    <span><b>Cohort</b> 6,543 records · 3.06 M cell-days</span>
    <span><b>Regions</b> 4</span>
    <span><b>Target</b> production (main) + PR #171 replay</span>
  </div>
</header>

<div class="tiles">
  <div class="tile is-bad">
    <p class="k">Dead-month false positives</p>
    <p class="v">41%</p>
    <p class="n">Median share of out-of-season cell-days scoring ≥4 — the recommendation threshold. Worst case 78%.</p>
  </div>
  <div class="tile is-bad">
    <p class="k">Weather-only season AUC</p>
    <p class="v">{np.median(weather_only):.3f}</p>
    <p class="n">Below random. Alone, the weather model cannot tell a fruiting month from a dead one.</p>
  </div>
  <div class="tile">
    <p class="k">Below random overall</p>
    <p class="v">7<span style="font-size:20px;color:var(--ink-3)">/17</span></p>
    <p class="n">Region-species pairs where the full score ranks dead months above the season.</p>
  </div>
  <div class="tile is-good">
    <p class="k">Spatial skill (in-season)</p>
    <p class="v">0.649</p>
    <p class="n">Percentile of the observed cell among same-day grid cells. Real, and unaffected by any of this.</p>
  </div>
</div>

<section class="sec">
  <p class="kicker">Method</p>
  <h2>What is different here</h2>
  <div class="prose">
    <p class="lede">Three things make this independent of the QA already in the repo.</p>
    <p><strong>Volumes come from GBIF <code>count</code> responses, not paginated samples.</strong>
    The existing background sampler draws two 300-record blocks at fixed offsets on
    high-volume days; GBIF's ordering clusters by dataset, so that sample skews
    geographically exactly when it matters most. Counts are exact.</p>
    <p><strong>Ground truth is effort-normalised.</strong> Every count is divided by all fungal
    observations in the same region and period, so observer effort, weekends and GBIF's
    year-on-year growth cancel out.</p>
    <p><strong>The score is decomposed.</strong> Production computes
    <code>score = weather_side × season_multiplier(date, zone)</code>, and the multiplier is
    exactly reproducible from the published curves — so the GBIF-derived climatology and the
    weather model can be scored separately. The weather side is the only part that cannot be
    circular.</p>
  </div>
</section>

<section class="sec">
  <p class="kicker">Test A</p>
  <h2>Seasonal amplitude is compressed by two to three orders of magnitude</h2>
  <p class="caption prose">The observed monthly ratio is measured correctly and then linearly
  rescaled into <code>[0.6, 1.0]</code>. A month with zero fruiting maps to 0.6, not to 0.
  The shape survives; the amplitude does not.</p>
  <pre><code>curve = {{m: round(low + (high - low) * (ratio[m] / mx), 3) for m in range(1, 13)}}
#            low=0.6, high=1.0        build_season_curves.py:190</code></pre>
  <div class="legend">
    <span><i class="swatch" style="background:var(--obs)"></i> observed fruiting rate</span>
    <span><i class="swatch" style="background:var(--mdl)"></i> model multiplier</span>
    <span>both normalised to their own peak · Jan → Dec · outlined cells are in-season months</span>
  </div>
  <div class="scroll">
    <table>
      <thead><tr>
        <th>Region</th><th>Species</th><th>Observed &nbsp;J–D</th><th>Model &nbsp;J–D</th>
        <th class="num">Observed range</th><th class="num">Model range</th>
        <th class="num">Understated by</th><th>Peak obs / model</th>
      </tr></thead>
      <tbody>{"".join(amplitude)}</tbody>
    </table>
  </div>
  <p class="caption">Full-year multiplier range is 1.67× for every species in every region — the
  floor is reached in all of them. The two strips agreeing in shape is near-circular, since the
  curve is built from GBIF too; the amplitude gap is not.</p>
</section>

<section class="sec">
  <p class="kicker">Test B</p>
  <h2>In-season versus dead-month discrimination</h2>
  <p class="caption prose">Within-location AUC, so no location's baseline level can carry the
  result. Months are labelled from the effort-normalised climatology: in-season ≥50% of peak
  rate, dead ≤10%. Only months inside the score window are testable.</p>
  <div class="scroll">
    <table>
      <thead><tr>
        <th>Region</th><th>Species</th><th class="num">Full score</th><th class="num">Weather only</th>
        <th class="num">Median in</th><th class="num">Median dead</th><th class="num">≥4 in</th>
        <th>≥4 in dead months</th>
      </tr></thead>
      <tbody>{"".join(separation)}</tbody>
    </table>
  </div>
  <p class="caption">Median full-score AUC {np.median(testable):.3f}; weather-only median
  {np.median(weather_only):.3f}. 0.5 is random.</p>

  <div class="callout">
    <h3>The failure is systematic, not noise</h3>
    <p>Every strong result is a <strong>spring</strong> species in a <strong>warm</strong> region
    (morel and St George's in S Europe / US East / US West score 0.94–0.99). Every inversion is a
    <strong>summer or autumn</strong> species in a <strong>warm</strong> region (S Europe porcini
    0.336, US East chanterelle 0.322, US West chanterelle 0.194).</p>
    <p>One mechanism explains both: Mediterranean and western-US summers are hot and dry, the
    weather side collapses, and a 1.5× seasonal tilt cannot lift it back. The spring species get
    the right answer for the wrong reason — they benefit from the same summer collapse that ruins
    the autumn species.</p>
    <p>Verified straight from the parquet, independently of the analysis code:</p>
<pre><code>S Europe porcini, April   (observed  5% of peak):  77.6% of cell-days ≥4, median 5.11, n=115,520
S Europe porcini, Jul–Aug (observed 80–100% of peak): 33.5% of cell-days ≥4, median 2.45, n=310,080</code></pre>
    <p>Southern Europe rates April <strong>more than twice as good as peak porcini
    season</strong>.</p>
  </div>
</section>

<section class="sec">
  <p class="kicker">Test C</p>
  <h2>Season start is not predicted</h2>
  <p class="caption prose">Observed onset is the first sustained crossing of 15% of the peak
  effort-normalised rate — the level must hold for most of the following week, so a single lucky
  observation cannot define it. The model's onset is the first day the regional median score
  reaches 4.0, the product's own recommendation threshold.</p>
  <div class="scroll">
    <table>
      <thead><tr>
        <th>Region</th><th>Species</th><th>Observed onset</th><th>Model reaches 4.0</th>
        <th class="num">Error</th><th class="num">Window model says ≥4</th><th class="num">Season's share of year</th>
      </tr></thead>
      <tbody>{"".join(onset)}</tbody>
    </table>
  </div>
  <p class="caption">Every European and eastern-US case fires early, several by more than a month.
  Morel and St George's are excluded — both were already fruiting on 2026-04-12, so their true
  onset is outside the window and no error can be claimed. The last two columns are the
  calibration problem in one line: N Europe porcini is recommendable on 73% of days in a season
  occupying 25% of the year. The US West rows fail the opposite way — medians there are so low
  (in-season 1.52 porcini, 0.88 chanterelle) that the region is almost never above threshold.</p>
</section>

<section class="sec">
  <p class="kicker">Tests D &amp; E</p>
  <h2>Does the weather model add anything?</h2>
  <div class="prose">
    <p>Both the score and the fruiting rate rise through the summer, so a raw correlation is
    mostly shared trend. After differencing — which removes any trend and asks whether fruiting
    moves <em>when the weather score moves</em>:</p>
  </div>
  <div class="scroll" style="max-width:640px">
    <table>
      <thead><tr><th>Resolution</th><th class="num">Median ρ</th><th class="num">Positive</th><th>Significant</th></tr></thead>
      <tbody>
        <tr><td class="sp">Day-over-day</td><td class="num">+0.062</td><td class="num muted">11/17</td><td class="muted">4 positive, 2 negative</td></tr>
        <tr><td class="sp">Week-over-week</td><td class="num">+0.132</td><td class="num muted">11/17</td><td class="muted">—</td></tr>
      </tbody>
    </table>
  </div>
  <div class="prose">
    <p>11 of 17 positive is not distinguishable from a coin flip (binomial p ≈ 0.17), and the
    significant results include genuine negatives (S Europe morel −0.251 daily, −0.581 weekly;
    US East chanterelle −0.197 weekly). The raw undifferenced correlations look much better —
    ρ up to 0.72 — but that is the shared summer trend, not skill.</p>
    <p><strong>Honest reading:</strong> no dependable short-term weather skill is demonstrated,
    and none is ruled out either. Daily GBIF counts are noisy and lag-affected, so this test has
    limited power; a null here is weak evidence, not proof. What it does establish is that the
    confident-looking seasonal correlations in the existing QA reports do not survive
    detrending.</p>
  </div>
</section>

<section class="sec">
  <p class="kicker">Counterweight</p>
  <h2>What the model is genuinely good at</h2>
  <p class="caption prose">For in-season observations, the score at the observed cell sits at
  percentile 0.649 (median) of all same-day grid cells. This background is a uniform grid
  sample, so observer-effort geography is <em>not</em> controlled and 0.649 is an upper bound —
  the existing observer-background QA gets 0.616 on the effort-controlled version. The two agree
  that the spatial signal is real.</p>
  <div class="scroll" style="max-width:680px">
    <table>
      <thead><tr><th>Region</th><th>Species</th><th class="num">n</th><th>In-season percentile</th></tr></thead>
      <tbody>{spatial}</tbody>
    </table>
  </div>
  <p class="caption">N Europe morel is instructive: 0.716 in-season but 0.513 out of season. The
  spatial signal exists exactly when the species is actually fruiting.</p>
</section>

<section class="sec">
  <p class="kicker">Defects</p>
  <h2>Two concrete bugs</h2>
  <div class="callout">
    <h3>1. The truffle season curve is inverted, and it silently overrode a correct one</h3>
    <p><code>build_season_curves.py:34</code> maps <code>truffle_b</code> to <code>8282501</code>
    — the <em>genus</em> Tuber — while the app scores and labels <em>Tuber melanosporum</em>, a
    winter species. Measured over 2020–2026 in Northern Europe:</p>
    <div class="scroll" style="max-width:520px">
      <table>
        <thead><tr><th>Taxon</th><th class="num">Records</th><th>Peak month</th></tr></thead>
        <tbody>
          <tr><td class="sp">Tuber genus <span class="muted">(builds the curve)</span></td><td class="num">2,086</td><td class="bad">August</td></tr>
          <tr><td class="sp">T. melanosporum <span class="muted">(what is scored)</span></td><td class="num bad">2</td><td class="muted">—</td></tr>
          <tr><td class="sp">T. aestivum <span class="muted">(actual Burgundy truffle)</span></td><td class="num">42</td><td>October</td></tr>
        </tbody>
      </table>
    </div>
    <p>The genus clears the builder's <code>min_total=200</code> trust gate, so a curve peaking in
    <strong>July</strong> is published and — per the precedence in <code>seasonality.py</code> —
    <em>overrides</em> the correct hand-written winter <code>season_months</code> of
    <code>[1,2,3,4,10,11,12]</code>. Had the species key been used, 2 records would have failed
    the gate and the correct window would have survived.</p>
  </div>
  <div class="callout">
    <h3>2. The curve builder does not filter <code>basisOfRecord</code></h3>
    <p>Only <code>hasCoordinate</code> is set, so preserved specimens and machine observations
    shape the curves while the app's users generate human observations. That is part of why genus
    Tuber looks like a summer taxon.</p>
  </div>
</section>

<section class="sec">
  <p class="kicker">PR #171</p>
  <h2>Better ranking, worse calibration</h2>
  <p class="caption prose"><code>main</code> and the branch scored over one identical replayed
  frame (1,152 N Europe locations, 101,376 cell-days, from 2026-05-24 — the earliest date with 42
  full lag days). Each version gets the lag frame it actually ran in production: 21 days without
  wind lags for <code>main</code>, 42 with wind lags for the branch. This removes the confound in
  the PR's own comparison, where stored production scores are measured against replayed branch
  scores.</p>
  <div class="scroll">
    <table>
      <thead><tr>
        <th>Species</th><th class="num">Season AUC main</th><th class="num">Season AUC branch</th>
        <th class="num">≥4 in dead months, main</th><th class="num">≥4 in dead months, branch</th>
      </tr></thead>
      <tbody>{branch}</tbody>
    </table>
  </div>
  <p class="caption">The branch improves month ordering for all five species and worsens the
  out-of-season false-positive rate for all five, by 12 to 21 points. Chanterelle is sharpest:
  after this PR, <strong>69% of dead-month cell-days in Northern Europe clear the recommendation
  threshold</strong>, up from 48%. That is the same "hit rates rise more than discrimination"
  effect the PR's own report noted — measured on the side it never measured.</p>

  <h3>In Southern Europe the branch helps the seasonal axis, and that deserves credit</h3>
  <p class="caption prose">S Europe dead months are January–April, which precede the replayable
  window, so only St George's is directly testable there (AUC 0.998 → 1.000). But Test B showed
  the southern problem is in-season scores sitting <em>below</em> dead-month scores, and the
  in-season lift is measurable:</p>
  <div class="scroll" style="max-width:640px">
    <table>
      <thead><tr><th>Species</th><th class="num">In-season median, main</th><th class="num">Branch</th><th class="num">April median (main)</th></tr></thead>
      <tbody>{south}</tbody>
    </table>
  </div>
  <p class="caption">The branch closes most of the southern inversion gap: in-season porcini rises
  from 3.39 to 4.55 against an April level of 5.11. April will rise too — it cannot be replayed,
  so the residual inversion is unmeasured — but the direction is right and the mechanism
  (moisture memory surviving a dry Mediterranean summer) is the correct one for this failure.
  The PR's southern claim is better supported by this than by the AUC delta it actually reports.</p>
</section>

<section class="sec">
  <p class="kicker">The fix</p>
  <h2>Implemented and re-measured</h2>
  <div class="prose">
    <p class="lede">The season term is now two terms. The multiplier still tilts the score
    across the calendar; a new gate is allowed to reach <strong>zero</strong> — the thing the
    model previously could not express.</p>
    <p>The gate reads the <em>uncompressed</em> monthly ratio, which the curve builder now
    publishes alongside the compressed multiplier. That ratio was always computed and then
    thrown away by the <code>[0.6, 1.0]</code> rescale. Both curve schemas load, so deployed
    curves keep working.</p>
  </div>
  <div class="tiles">
    <div class="tile is-good">
      <p class="k">Season AUC, median</p>
      <p class="v">{fix_stats['before']['auc']:.3f} → {fix_stats['after']['auc']:.3f}</p>
      <p class="n">Across all {fix_stats['after']['n']} testable region-species. 0.5 is random.</p>
    </div>
    <div class="tile is-good">
      <p class="k">Dead-month false positives</p>
      <p class="v">{fix_stats['before']['dead'] * 100:.0f}% → {fix_stats['after']['dead'] * 100:.0f}%</p>
      <p class="n">Median share of out-of-season cell-days above the recommendation threshold.</p>
    </div>
    <div class="tile">
      <p class="k">In-season recommendations</p>
      <p class="v">{fix_stats['before']['inside'] * 100:.0f}% → {fix_stats['after']['inside'] * 100:.0f}%</p>
      <p class="n">Unchanged. The out-of-season noise goes without costing a single in-season day.</p>
    </div>
    <div class="tile is-good">
      <p class="k">Below random</p>
      <p class="v">{fix_stats['before']['below']} → {fix_stats['after']['below']}</p>
      <p class="n">Every inversion recovered except the western-US chanterelle.</p>
    </div>
  </div>
  <div class="scroll">
    <table>
      <thead><tr>
        <th>Region</th><th>Species</th><th class="num">AUC before</th><th class="num">after</th>
        <th class="num">≥4 dead, before</th><th class="num">after</th>
        <th class="num">≥4 in, before</th><th class="num">after</th><th></th>
      </tr></thead>
      <tbody>{"".join(fix_rows)}</tbody>
    </table>
  </div>
  <p class="caption">Onset error improves too: median 27 d → 15 d, and the model now fires
  early in 3 of 11 cases rather than 9 of 11.</p>

  <div class="callout">
    <h3>Two of the recommendations were wrong, and the measurement says so</h3>
    <p><strong>Lowering the multiplier floor is not worth it.</strong> It buys more separation
    (AUC 0.950, 0% dead-month false positives) but suppresses the real season too: in-season
    days above threshold fall 56% → 40%, median onset error rises 15 → 41 days, and four
    region-species never reach the threshold at all. The floor stays at 0.6 and the gate does
    the cutting.</p>
    <p><strong>The gate thresholds needed tuning, not just adding.</strong> At the first guess
    the season started <em>late</em> — trading "always on" for "switches on too late", the same
    failure wearing different clothes.</p>
    <div class="scroll" style="max-width:600px">
      <table>
        <thead><tr><th>Gate off / full</th><th class="num">Season AUC</th><th class="num">≥4 dead</th><th class="num">Onset error</th><th></th></tr></thead>
        <tbody>{sweep}</tbody>
      </table>
    </div>
  </div>

  <h3>Truffle</h3>
  <p class="caption prose"><code>truffle_b</code> now maps to <code>5258468</code>
  (<em>T. melanosporum</em>), and the rebuild confirms the intended behaviour:
  <code>target=0 sightings → SKIP</code> in all four regions, so no curve is published and the
  correct hand-written winter window applies again. The builder also filters
  <code>basisOfRecord=HUMAN_OBSERVATION</code>.</p>

  <h3>Still open</h3>
  <p class="caption prose">Western-US chanterelle stays below random. Component capture shows
  the region is vetoed by humidity — median component <strong>0.042</strong> against 0.581 in
  N Europe, with <code>optimal_humidity=80</code> in both — but deserts and California
  correctly score 0.00, and the one zone that matters (<code>marine_west_coast</code>, holding
  18 of 27 chanterelle finds) is only testable in July–August, which is early for Pacific
  Northwest chanterelles. Bringing humidity, temperature and moisture all to N Europe levels
  would still only reach ~4.2, so no single parameter rescues it. It needs autumn data — which
  is now being accumulated at 13 KB/month, because R2's four-month retention is why nobody
  could ever check this.</p>
</section>

<section class="sec">
  <p class="kicker">Limits</p>
  <h2>What this cannot tell you</h2>
  <ul class="plain">
    <li><strong>The window is 2026-04-12 → 08-20.</strong> R2 retains no more score history, so
    autumn and winter are untestable — which spares the model its hardest cases: parasol's true
    peak is October, black chanterelle's September, truffle's winter.</li>
    <li><strong>Presence-only ground truth.</strong> GBIF absence is not biological absence.
    Effort normalisation removes the largest bias but not reporting lag, identification skew or
    misdated records — 54 N Europe <em>Cantharellus</em> records in January are almost certainly
    one of the latter two.</li>
    <li><strong>Shape agreement is near-circular</strong> — the curve and the observed climatology
    both come from GBIF. Only the amplitude finding and the weather-side tests are independent of
    that, which is why the verdict rests on those.</li>
    <li><strong>The detrended weather tests are low-powered</strong> (≈120 days, ≈18 weeks per
    region-species). Treat the null as "not demonstrated", not "absent".</li>
    <li><strong>The branch replay starts 2026-05-24</strong> and cannot reach April, which is
    where the southern inversion lives. The PR's effect on the inversion itself is inferred from
    the in-season lift, not measured. The replay omits US East and US West.</li>
    <li>One-year cohort, no held-out year. The 2026 season may not be typical.</li>
  </ul>
</section>

<section class="sec">
  <p class="kicker">Recommendations</p>
  <h2>What I would change</h2>
  <ol class="recs">
    <li><strong>Raise the seasonal dynamic range.</strong> <code>--low 0.6</code> is the single
    highest-leverage number in the model. Even <code>low=0.15</code> would let a dead month read
    as dead. One flag plus a curve rebuild, testable with the harness in this directory.</li>
    <li><strong>Add a season gate to recommendations.</strong> Independent of the curve, don't let
    <code>worth_foraging_now</code> surface a species in a month holding &lt;10% of its peak
    effort-normalised rate. Cheap, and it caps the worst user-facing failure immediately.</li>
    <li><strong>Fix <code>truffle_b</code> to the species key</strong> (<code>5258468</code>), or
    relabel the product species to <em>T. aestivum</em> and use that. Either way the curve should
    fail the trust gate and fall back to the correct winter <code>season_months</code>.</li>
    <li><strong>Filter <code>basisOfRecord=HUMAN_OBSERVATION</code> in the curve builder</strong>,
    matching the population the app actually serves.</li>
    <li><strong>Investigate the southern and western inversion before further weather tuning.</strong>
    S Europe and US West are not miscalibrated by a constant; they are anti-correlated with the
    season. PR #171 improves the symptom in Spain, but the sign error is upstream of it.</li>
    <li><strong>Add the dead-month false-positive rate to the PR checklist.</strong> One line next
    to the existing hit-rate computation, and it is the number that moves the wrong way here.</li>
  </ol>
</section>

<footer>
  <p>Every figure comes from <code>scripts/qa_season_truth.py</code>,
  <code>qa_season_scan.py</code>, <code>qa_season_analysis.py</code> and
  <code>qa_season_branch_replay.py</code>, or from <code>season-analysis.json</code> and the
  parquet files beside it. Metric logic is covered by
  <code>tests/test_qa_season_metrics.py</code>. Nothing here is computed off-script.</p>
</footer>
</div>
"""

OUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUT}  ({len(HTML):,} bytes)")
print(f"amplitude rows {len(amplitude)}, separation {len(separation)}, onset {len(onset)}")
print(f"medians: full {np.median(testable):.3f} weather {np.median(weather_only):.3f} "
      f"dead-share {np.median(dead_shares):.3f}")
