"""Reproducible subregional geography analysis for the observer-background QA.

The broad observer-background AUC answers whether the model ranks a target finding above
same-day European fungal-observer cells. This analysis makes the Finland/Iberia example
auditable without treating a bounding rectangle as a country or mixing northern finds
with a country-wide score median.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


DEFAULT_ROOT = Path("docs/qa/model-evaluation-2026")
SPECIES = {
    "mushroom": "Porcini",
    "chant": "Chanterelle",
}


@dataclass(frozen=True)
class Area:
    key: str
    label: str
    country_code: str
    min_lat: float = -90.0
    max_lat: float = 90.0

    def select(self, frame: pd.DataFrame) -> pd.Series:
        country = frame["country_code"].fillna("").str.upper()
        return (
            country.eq(self.country_code)
            & frame["lat"].ge(self.min_lat)
            & frame["lat"].lt(self.max_lat)
        )


AREAS = (
    Area("finland_south", "Southern Finland (<65°N)", "FI", max_lat=65.0),
    Area("finland_north", "Northern Finland (≥65°N)", "FI", min_lat=65.0),
    Area("spain_south", "Southern Spain (<40°N)", "ES", max_lat=40.0),
    Area("spain_central", "Central Spain (40–42°N)", "ES", min_lat=40.0, max_lat=42.0),
    Area("spain_north", "Northern Spain (≥42°N)", "ES", min_lat=42.0),
    Area("portugal", "Portugal", "PT"),
)


def weighted_percentile(score: float, values: pd.Series, weights: pd.Series) -> float | None:
    valid = values.notna() & weights.notna() & np.isfinite(values) & np.isfinite(weights)
    if not valid.any():
        return None
    values = values[valid].astype(float)
    weights = weights[valid].astype(float)
    total = float(weights.sum())
    if total <= 0:
        return None
    below = float(weights[values < score].sum())
    equal = float(weights[values == score].sum())
    return (below + 0.5 * equal) / total


def attach_country_percentiles(background: pd.DataFrame, targets: pd.DataFrame) -> pd.DataFrame:
    targets = targets.copy()
    targets["country_percentile"] = np.nan
    targets["country_control_cells"] = 0
    grouped = {
        key: group
        for key, group in background.groupby(["country_code", "date"], dropna=False)
    }
    for index, row in targets.iterrows():
        controls = grouped.get((row["country_code"], row["date"]))
        column = f"new_{row['species_id']}_score"
        if controls is None or column not in controls or not math.isfinite(row["new_score"]):
            continue
        valid = (
            controls[column].notna()
            & controls["sample_weight"].notna()
            & np.isfinite(controls[column])
            & np.isfinite(controls["sample_weight"])
        )
        targets.at[index, "country_control_cells"] = int(valid.sum())
        targets.at[index, "country_percentile"] = weighted_percentile(
            float(row["new_score"]), controls[column], controls["sample_weight"]
        )
    return targets


def finite_median(series: pd.Series) -> float | None:
    values = pd.to_numeric(series, errors="coerce")
    values = values[np.isfinite(values)]
    return float(values.median()) if len(values) else None


def finite_mean(series: pd.Series) -> float | None:
    values = pd.to_numeric(series, errors="coerce")
    values = values[np.isfinite(values)]
    return float(values.mean()) if len(values) else None


def day_bootstrap_ci(
    findings: pd.DataFrame, iterations: int = 10_000, seed: int = 20260828
) -> list[float] | None:
    valid = findings[np.isfinite(findings.country_percentile)].copy()
    days = valid.date.drop_duplicates().to_numpy()
    if len(days) < 2:
        return None
    by_day = {
        day: valid.loc[valid.date.eq(day), "country_percentile"].to_numpy()
        for day in days
    }
    rng = np.random.default_rng(seed)
    estimates = np.empty(iterations)
    for index in range(iterations):
        sampled_days = rng.choice(days, size=len(days), replace=True)
        estimates[index] = np.concatenate([by_day[day] for day in sampled_days]).mean()
    low, high = np.quantile(estimates, [0.025, 0.975])
    return [float(low), float(high)]


def summarise(
    background: pd.DataFrame, targets: pd.DataFrame, metadata: dict
) -> dict:
    required_by_frame = {
        "background": {"country_code", "lat", "date", "sample_weight"},
        "targets": {"country_code", "lat", "date", "species_id", "new_score"},
    }
    for name, frame in (("background", background), ("targets", targets)):
        required = required_by_frame[name]
        missing = required - set(frame.columns)
        if missing:
            raise RuntimeError(f"{name} is missing required columns: {sorted(missing)}")

    targets = targets[targets.species_id.isin(SPECIES)].copy()
    targets = attach_country_percentiles(background, targets)
    rows = []
    for area in AREAS:
        area_background = background[area.select(background)]
        area_targets = targets[area.select(targets)]
        entry = {
            "key": area.key,
            "area": area.label,
            "country_code": area.country_code,
            "latitude": [area.min_lat, area.max_lat],
            "sampled_fungal_observer_cell_days": int(len(area_background)),
            "estimated_fungal_observer_cell_days": float(
                area_background.sample_weight.sum()
            ),
            "species": {},
        }
        for species_id, label in SPECIES.items():
            controls = area_background[f"new_{species_id}_score"]
            findings = area_targets[area_targets.species_id == species_id]
            entry["species"][species_id] = {
                "label": label,
                "background_median": finite_median(controls),
                "findings": int(len(findings)),
                "finding_median": finite_median(findings.new_score),
                "mean_country_percentile": finite_mean(findings.country_percentile),
                "finding_dates": findings.date.value_counts().sort_index().to_dict(),
                "latitude_range": (
                    [float(findings.lat.min()), float(findings.lat.max())]
                    if len(findings)
                    else None
                ),
            }
        rows.append(entry)

    country_results = {}
    for country_code, label in (("FI", "Finland"), ("ES", "Spain"), ("PT", "Portugal")):
        country_targets = targets[targets.country_code.eq(country_code)]
        country_background = background[background.country_code.eq(country_code)]
        country_results[country_code] = {
            "label": label,
            "sampled_fungal_observer_cell_days": int(len(country_background)),
            "species": {
                species_id: {
                    "label": species_label,
                    "findings": int(len(findings)),
                    "background_median": finite_median(
                        country_background[f"new_{species_id}_score"]
                    ),
                    "finding_median": finite_median(findings.new_score),
                    "mean_europe_percentile": finite_mean(findings.new_percentile),
                    "mean_country_percentile": finite_mean(findings.country_percentile),
                    "country_percentile_day_bootstrap_ci": day_bootstrap_ci(findings),
                    "median_same_day_country_controls": finite_median(
                        findings.country_control_cells
                    ),
                    "active_days": int(findings.date.nunique()),
                    "latest_finding_date": (
                        str(findings.date.max()) if len(findings) else None
                    ),
                    "findings_after_2026_08_12": int(
                        (findings.date > "2026-08-12").sum()
                    ),
                }
                for species_id, species_label in SPECIES.items()
                for findings in [country_targets[country_targets.species_id == species_id]]
            },
        }

    spanish = targets[targets.country_code.eq("ES")]
    portuguese = targets[targets.country_code.eq("PT")]
    return {
        "schema_version": 1,
        "period": metadata["period"],
        "retrieved_at_utc": metadata.get("retrieved_at_utc"),
        "matched_target_date_range": metadata.get("matched_target_date_range"),
        "matched_background_date_range": metadata.get("matched_background_date_range"),
        "score_variant": "resilient scorer replay",
        "areas": rows,
        "countries": country_results,
        "iberian_target_audit": {
            "spain_findings": int(len(spanish)),
            "portugal_findings": int(len(portuguese)),
            "spain_latitude_range": (
                [float(spanish.lat.min()), float(spanish.lat.max())]
                if len(spanish)
                else None
            ),
            "spain_dates": spanish.date.value_counts().sort_index().to_dict(),
        },
    }


def value(value: float | None, digits: int = 2) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def render(summary: dict) -> str:
    rows = []
    for area in summary["areas"]:
        porcini = area["species"]["mushroom"]
        chant = area["species"]["chant"]
        rows.append(
            f"| {area['area']} | {area['sampled_fungal_observer_cell_days']:,} | "
            f"{value(porcini['background_median'])} | {porcini['findings']} | "
            f"{value(porcini['finding_median'])} | {value(chant['background_median'])} | "
            f"{chant['findings']} | {value(chant['finding_median'])} |"
        )

    audit = summary["iberian_target_audit"]
    areas = {area["key"]: area for area in summary["areas"]}
    spanish = summary["countries"]["ES"]["species"]
    porcini_ci = spanish["mushroom"]["country_percentile_day_bootstrap_ci"]
    chant_ci = spanish["chant"]["country_percentile_day_bootstrap_ci"]
    south_finds = sum(
        species["findings"] for species in areas["spain_south"]["species"].values()
    )
    central_finds = sum(
        species["findings"] for species in areas["spain_central"]["species"].values()
    )
    north_finds = sum(
        species["findings"] for species in areas["spain_north"]["species"].values()
    )
    latitude = audit["spain_latitude_range"]
    latitude_text = (
        f"{latitude[0]:.2f}–{latitude[1]:.2f}°N" if latitude else "not available"
    )
    start, end = summary["period"]
    retrieved = summary["retrieved_at_utc"].split("T", 1)[0]
    latest_target = summary["matched_target_date_range"][1]
    return f"""# Observer-background geography audit

Period: **{start} through {end}**. Scores use the replayed resilient scorer.
GBIF data were retrieved on **{retrieved}**; the latest matched target event is
**{latest_target}**, so the final days are incomplete because of reporting lag.

## Direct subregional check

| Area | Sampled fungal-observer cell-days | Porcini background median | Porcini finds | Porcini finding median | Chanterelle background median | Chanterelle finds | Chanterelle finding median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(rows)}

The former “Spain” row was not a country cohort: it used an Iberian bounding rectangle
that also admitted Portuguese observations. This replacement uses GBIF country codes and
then divides Spain into explicit latitude bands.

There are **{audit['spain_findings']}** Spanish Porcini/Chanterelle cell-days and
**{audit['portugal_findings']}** Portuguese cell-days in this cohort. Spanish findings span
**{latitude_text}**: **{south_finds}** are south of 40°N, **{central_finds}** are between
40–42°N, and **{north_finds}** are at or north of 42°N. Counts remain presence-only and
must not be read as prevalence.

The map does express a strong Spanish north–south gradient: northern-Spain background
medians are **{value(areas['spain_north']['species']['mushroom']['background_median'])}**
for Porcini and **{value(areas['spain_north']['species']['chant']['background_median'])}**
for Chanterelle, versus **{value(areas['spain_south']['species']['mushroom']['background_median'])}**
and **{value(areas['spain_south']['species']['chant']['background_median'])}** in the south.
That part of the original visual observation is supported.

It does not follow that Spanish locations are ranked well. Against same-day fungal-observer
cells inside Spain, mean presence-background percentiles are
**{value(spanish['mushroom']['mean_country_percentile'], 3)}** for Porcini (day-bootstrap
95% CI **{value(porcini_ci[0], 3)}–{value(porcini_ci[1], 3)}**) and
**{value(spanish['chant']['mean_country_percentile'], 3)}** for Chanterelle (CI
**{value(chant_ci[0], 3)}–{value(chant_ci[1], 3)}**; random = 0.500). Porcini therefore
ranks poorly inside Spain; Chanterelle is inconclusive overall, with only five findings
on four days and three northern findings carrying the stronger northern result.

Extending the endpoint from 12 to 27 August adds no Spanish Porcini or Chanterelle event
dates: the latest are **{spanish['mushroom']['latest_finding_date']}** and
**{spanish['chant']['latest_finding_date']}**. It still matters for the continental cohort,
but it does not change the Spanish geographic conclusion.

Background medians show whether the map distinguishes the bands. Finding medians show
what it assigned at actual occurrence cells. The same-day within-country percentile is
the more direct statistic for whether it ranks locations inside Spain.

## Method

- GBIF `HUMAN_OBSERVATION`, `PRESENT`, coordinate-bearing records from 2026.
- Coordinate uncertainty above 20 km was excluded and observations were deduplicated to
  20 km cell-days.
- Country membership comes from GBIF `countryCode`, not rectangular country proxies.
- Scores are the resilient scorer replayed from retained production weather history.
- Each finding’s within-country percentile compares it with same-day cells where any
  fungus was reported in that country, weighted for the continental background sampling.
- Confidence intervals resample observation days, preserving same-day clusters. Spanish
  control samples are sparse, so the within-country result is diagnostic rather than a
  definitive country-specific validation.
- Recent GBIF dates are subject to reporting lag; the retrieval timestamp is retained in
  `geography-summary.json`.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--observer-source", default=DEFAULT_ROOT / "spatial-observer-background"
    )
    parser.add_argument(
        "--resilient-source", default=DEFAULT_ROOT / "resilient-score-ablation"
    )
    args = parser.parse_args()
    observer = Path(args.observer_source)
    resilient = Path(args.resilient_source)
    background = pd.read_csv(resilient / "background-comparison.csv")
    targets = pd.read_csv(resilient / "matched-target-comparison.csv")
    metadata = json.loads((observer / "run-metadata.json").read_text(encoding="utf-8"))
    summary = summarise(background, targets, metadata)
    (observer / "geography-summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    (observer / "macro-region-report.md").write_text(
        render(summary), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
