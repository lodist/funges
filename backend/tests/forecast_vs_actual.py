"""Quantify the freeze-the-past tradeoff: how far is a day-0 forecast from the
measured actual that later materialises?

The pipeline freezes each calendar day at the forecast we held for it on day-0
(see the decision doc). The error that introduces can only be measured by pairing
a forecast MADE for date D against the ACTUAL observed on D — which requires time
to pass. This tool does exactly that, in two modes:

  capture  — fetch today's 7-day forecast for a sample of coords and append each
             (coord, target_date, captured_on, forecast precip/temp) to a JSONL
             snapshot. Run it daily (or once) to build up paired data.
  compare  — for every snapshot row whose target_date has now passed, fetch
             history.json (the measured actual) for that date and report the
             absolute error per variable (rain is what drives the model).

Usage:
  python tests/forecast_vs_actual.py capture
  python tests/forecast_vs_actual.py compare
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from urllib.error import HTTPError

_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = Path(__file__).resolve().parent / "forecast_vs_actual_snapshot.jsonl"

# A small spread of NE coordinates (Sweden, Denmark, UK, France, Germany).
SAMPLE_COORDS = [
    (59.330, 18.070), (55.680, 12.570), (51.500, -0.130), (48.850, 2.350),
    (52.520, 13.405), (57.700, 11.970), (53.350, -6.260), (60.170, 24.940),
    (50.110, 8.680), (45.760, 4.840),
]


def _load_key():
    for fn in [".env.secret", ".env"]:
        p = _ROOT / fn
        if p.exists():
            for ln in p.read_text(encoding="utf-8").splitlines():
                s = ln.strip()
                if s.startswith("WEATHERAPI_KEY") and "=" in s:
                    return s.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("WEATHERAPI_KEY not found")


def _get(endpoint, key, **params):
    q = urllib.parse.urlencode({"key": key, **params})
    try:
        with urllib.request.urlopen(f"https://api.weatherapi.com/v1/{endpoint}?{q}", timeout=25) as r:
            return json.load(r)
    except HTTPError as e:
        return {"_error": f"{e.code}: {e.read().decode(errors='replace')[:200]}"}


def capture():
    key = _load_key()
    today = date.today().isoformat()
    n = 0
    with SNAPSHOT.open("a", encoding="utf-8") as f:
        for lat, lon in SAMPLE_COORDS:
            data = _get("forecast.json", key, q=f"{lat},{lon}", days=7, aqi="no", alerts="no")
            for fd in data.get("forecast", {}).get("forecastday", []):
                d = fd.get("day", {})
                f.write(json.dumps({
                    "lat": lat, "lon": lon,
                    "target_date": fd.get("date"),
                    "captured_on": today,
                    "lead_days": (datetime.strptime(fd["date"], "%Y-%m-%d").date()
                                  - date.today()).days,
                    "fc_precip_mm": d.get("totalprecip_mm"),
                    "fc_avgtemp_c": d.get("avgtemp_c"),
                }) + "\n")
                n += 1
    print(f"captured {n} forecast-day rows for {len(SAMPLE_COORDS)} coords on {today} -> {SNAPSHOT}")


def compare():
    if not SNAPSHOT.exists():
        raise SystemExit("no snapshot yet; run `capture` first (and wait for dates to pass)")
    key = _load_key()
    today = date.today()
    rows = [json.loads(ln) for ln in SNAPSHOT.read_text(encoding="utf-8").splitlines() if ln.strip()]
    due = [r for r in rows if datetime.strptime(r["target_date"], "%Y-%m-%d").date() < today]
    if not due:
        print("no captured target_dates have passed yet — re-run `compare` after they do.")
        return

    actual_cache = {}
    precip_err, temp_err = [], []
    for r in due:
        ck = (r["lat"], r["lon"], r["target_date"])
        if ck not in actual_cache:
            actual_cache[ck] = _get("history.json", key, q=f"{r['lat']},{r['lon']}", dt=r["target_date"])
        adata = actual_cache[ck]
        fdays = adata.get("forecast", {}).get("forecastday", [])
        if not fdays:
            continue
        ad = fdays[0]["day"]
        if r["fc_precip_mm"] is not None and ad.get("totalprecip_mm") is not None:
            precip_err.append(abs(r["fc_precip_mm"] - ad["totalprecip_mm"]))
        if r["fc_avgtemp_c"] is not None and ad.get("avgtemp_c") is not None:
            temp_err.append(abs(r["fc_avgtemp_c"] - ad["avgtemp_c"]))

    def _stats(xs):
        if not xs:
            return "n/a"
        xs = sorted(xs)
        mean = sum(xs) / len(xs)
        return f"n={len(xs)} mean={mean:.2f} median={xs[len(xs)//2]:.2f} max={xs[-1]:.2f}"

    print(f"Paired forecast-vs-actual over {len(due)} due rows:")
    print(f"  |precip error| mm : {_stats(precip_err)}")
    print(f"  |avgtemp error| C : {_stats(temp_err)}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "capture"
    {"capture": capture, "compare": compare}.get(mode, capture)()
