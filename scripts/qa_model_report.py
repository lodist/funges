"""Build the comprehensive model-evaluation report from committed QA artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
DEFAULT_ROOT = Path("docs/qa/model-evaluation-2026")


def weighted_result(payload: dict, metric: str) -> tuple[float, int]:
    pairs = [
        (entry[metric], entry[f"{metric}_n"])
        for region in payload.values()
        for entry in region.values()
        if entry.get(metric) is not None and entry.get(f"{metric}_n", 0) > 0
    ]
    average = np.average(
        [value for value, _ in pairs], weights=[weight for _, weight in pairs]
    )
    return float(average), sum(weight for _, weight in pairs)


def season_result(payload: dict, variant: str) -> dict:
    entries = [
        species["variants"][variant]
        for region in payload.values()
        for species in region.values()
        if species["variants"][variant].get("auc") is not None
    ]
    return {
        "auc": float(np.median([entry["auc"] for entry in entries])),
        "below_random": sum(entry["auc"] < 0.5 for entry in entries),
        "dead_ge4": float(np.median([entry["share_ge4_dead"] for entry in entries])),
        "in_ge4": float(np.median([entry["share_ge4_in"] for entry in entries])),
        "tests": len(entries),
    }


def onset_result(payload: dict, variant: str) -> dict:
    errors = [
        species["onset"].get(f"{variant}_error_days")
        for region in payload.values()
        for species in region.values()
        if not species["onset"].get("censored")
        and species["onset"].get(f"{variant}_error_days") is not None
    ]
    return {
        "median_days": float(np.median(errors)),
        "median_absolute_days": float(np.median(np.abs(errors))),
        "early": sum(error < 0 for error in errors),
        "tests": len(errors),
    }


def render(root: Path) -> str:
    def read_json(relative: str) -> dict:
        return json.loads((root / relative).read_text(encoding="utf-8"))

    seasonal = read_json("seasonal-timing/season-simulation.json")
    weather_skill = read_json("seasonal-timing/weather-skill.json")
    weather_spatial = read_json("seasonal-timing/weather-spatial.json")
    grid_meta = read_json("spatial-grid-background/run-metadata.json")
    resilient = read_json("resilient-score-ablation/summary.json")
    report_metrics = read_json("report-metrics.json")
    candidate_baseline = read_json("candidate-baseline.json")

    before = season_result(seasonal, "production")
    current = season_result(seasonal, "gate_only")
    onset = onset_result(seasonal, "gate_only")
    timing_weather, timing_n = weighted_result(weather_skill, "weather_part")
    timing_season, _ = weighted_result(weather_skill, "season_part")
    timing_full, _ = weighted_result(weather_skill, "full_score")
    spatial_static, spatial_n = weighted_result(weather_spatial, "static_part")
    spatial_weather, _ = weighted_result(weather_spatial, "weather_part")
    spatial_full, _ = weighted_result(weather_spatial, "full_score")
    region_rows = report_metrics["macro_region_ablation"]
    geography = report_metrics["geography_check"]
    primary = grid_meta["primary_fungal_result"]

    geo_table = "\n".join(
        f"| {row['area']} | {row['fungal_observer_cell_days']:,} | {row['porcini_median']:.2f} | "
        f"{row['porcini_findings']} | {row['chanterelle_median']:.2f} | "
        f"{row['chanterelle_findings']} |"
        for row in geography
    )
    region_table = "\n".join(
        f"| {row['region']} | {row['target_cell_days']} | {row['previous_auc']:.3f} | "
        f"{row['current_auc']:.3f} | {row['current_auc'] - row['previous_auc']:+.3f} |"
        for row in region_rows
    )
    candidate_rows = []
    for region, species_map in candidate_baseline["results"].items():
        for species in ("mushroom", "chant"):
            if species not in species_map:
                continue
            entry = species_map[species]
            fold_values = [
                fold["full_score"]
                for fold in entry["folds"].values()
                if fold.get("full_score") is not None
            ]
            label = "Porcini" if species == "mushroom" else "Chanterelle"
            candidate_rows.append(
                f"| {region} | {label} | {entry['static_part']:.3f} | "
                f"{entry['weather_part']:.3f} | {entry['full_score']:.3f} | "
                f"{min(fold_values):.3f}-{max(fold_values):.3f} |"
            )
    candidate_table = "\n".join(candidate_rows)
    candidate_history_rows = sum(
        entry["rows"] for entry in candidate_baseline["evaluation"]["history"].values()
    )

    return f"""# Fung.es model evaluation, 2026

Status: **current evidence summary**, generated from the committed QA artifacts in this directory.

## Executive result

The model has demonstrated useful skill at its intended broad foraging-map scale. It does
two important jobs:

1. It identifies the active part of the year. After the season gate was added, median
   season-discrimination AUC rose from **{before['auc']:.3f}** to **{current['auc']:.3f}**
   across {current['tests']} testable region-species combinations. Dead-season cell-days
   above the user-facing score threshold fell from **{before['dead_ge4']:.1%}** to
   **{current['dead_ge4']:.1%}**, while in-season coverage stayed at
   **{current['in_ge4']:.1%}**.
2. It ranks useful macro-regions. Against same-day cells where people reported any fungus,
   the current resilient scorer reaches **{resilient['new_primary_auc']:.3f}** AUC over
   {sum(row['target_cell_days'] for row in region_rows):,} Porcini, Chanterelle, and
   Parasol cell-days. Random ranking is 0.500.

That supports the operational behavior users see: when southern Finland is strongly
scored, many in-season findings occur there; when Spain is weakly scored in the same
summer window, far fewer target findings occur there. It does **not** establish precise
stand-level habitat ranking or reliable day-to-day fruiting forecasts. Those are separate,
harder questions.

| Question | Cohort and control | Result | Interpretation |
| --- | --- | ---: | --- |
| Is the season active? | Same locations, fruiting vs dead months | AUC **{current['auc']:.3f}** | Strong operational timing after the gate |
| Does the calendar help on an observation day? | Same location, nearby control days | season **{timing_season:.3f}**, full **{timing_full:.3f}** | The season term carries real timing information |
| Does short-term weather pick the day? | Same location, nearby control days | **{timing_weather:.3f}**, n={timing_n:,} | Near-neutral overall; not yet demonstrated |
| Does the map rank European macro-regions? | Same-day fungal-observer background | **{resilient['new_primary_auc']:.3f}** | Useful broad geographic signal |
| Does it rank cells within the same climate zone? | Uniform same-day zone background | **{primary['weighted_auc']:.3f}** | Positive but modest fine-scale signal |
| Which spatial side currently carries signal? | Same-day cross-location decomposition | weather **{spatial_weather:.3f}**, static **{spatial_static:.3f}**, full **{spatial_full:.3f}** | Static habitat is the clearest improvement target |

## Seasonal timing: the repaired model

The long historical season report in `seasonal-timing/` diagnosed the model before it
could turn a species off. That diagnosis led to the season gate and should not be read as
the current verdict.

On the same retained April-August grid, the current gate produced:

- median season AUC **{current['auc']:.3f}**, with {current['below_random']} of
  {current['tests']} tests below random;
- **{current['dead_ge4']:.1%}** median dead-season false positives at score >=4, down from
  **{before['dead_ge4']:.1%}**;
- unchanged **{current['in_ge4']:.1%}** in-season coverage;
- median onset error **{onset['median_days']:+.0f} days** and median absolute error
  **{onset['median_absolute_days']:.1f} days** over {onset['tests']} uncensored onsets.

This is the right headline: seasonal timing works at monthly resolution. The next known
timing limitation is the interpolation of monthly curves, which smears sharp boundaries.

## Macro-region behavior

The observer-background assessment controls the largest presence-only bias by comparing
target finds with other fungal-observer cells on the same day. The resilient scorer is
almost neutral in northern Europe and materially improves southern Europe:

| Region | Target cell-days | Previous AUC | Current AUC | Change |
| --- | ---: | ---: | ---: | ---: |
{region_table}

The direct geography check from that cohort makes the behavior concrete:

| Area | Fungal-observer cell-days | Porcini median | Porcini finds | Chanterelle median | Chanterelle finds |
| --- | ---: | ---: | ---: | ---: | ---: |
{geo_table}

These counts are not prevalence estimates: GBIF is presence-only. They show that the map's
broad ordering agrees with where the target reports concentrate during the evaluated
window. Spain still contains real June finds that the model underrates, so low regional
scores must not be interpreted as biological absence.

## Why the other AUC is lower

The within-zone report gives **{primary['weighted_auc']:.3f}**
({primary['day_bootstrap_ci'][0]:.3f}-{primary['day_bootstrap_ci'][1]:.3f}) for the three
adequately sampled fungi. It deliberately removes season and broad climate-zone geography.
It asks whether the model selects the best local cell after those advantages are taken
away. It is therefore a stricter habitat-resolution test, not a contradictory verdict on
the whole map.

The decomposition says the same thing. Across {spatial_n:,} spatial cases, the weather
side ranks at **{spatial_weather:.3f}**, while the existing altitude/pH/water static side
is **{spatial_static:.3f}**. Northern-Europe static AUC is especially weak for Porcini and
Chanterelle. This is why tree-genus composition and distributional terrain features are
the next model work.

The new candidate runner establishes the current frozen baseline before those features
are added. It recomputes the current scorer over {candidate_history_rows:,} cached NE/SE weather rows and
reports deterministic two-degree spatial folds:

| Region | Species | Static AUC | Weather AUC | Full AUC | Full AUC across folds |
| --- | --- | ---: | ---: | ---: | ---: |
{candidate_table}

The fold range is diagnostic rather than a confidence interval. Candidate selection will
use four folds and reserve one untouched fold for the promotion decision.

## Evidence boundaries

- The season curves and the GBIF climatology share a data source. The gate's operational
  separation is measured, but curve shape is not a fully independent scientific test.
- Presence-background AUC is not presence/absence AUC. Same-day fungal-observer controls
  reduce observer-effort bias but cannot remove it completely.
- The retained score window ends before the main autumn season for several fungi.
- Short-term weather timing is near neutral in the case-crossover test; it should be
  described as unproven rather than absent.
- Fine-scale static habitat discrimination is weak in northern Europe and is the active
  improvement target.

## Artifact guide

- [`seasonal-timing/`](seasonal-timing/) - current gate simulation, weather attribution,
  historical pre-gate diagnosis, and sampled grid data.
- [`seasonal-ground-truth/`](seasonal-ground-truth/) - retained GBIF seasonal counts and
  observations.
- [`spatial-observer-background/`](spatial-observer-background/) - the primary macro-region
  operational QA with same-day human fungal-observer controls.
- [`spatial-grid-background/`](spatial-grid-background/) - stricter same-day, within-zone
  ranking assessment.
- [`resilient-score-ablation/`](resilient-score-ablation/) - paired old/current scorer
  comparison on identical weather and observations.
- [`climatology/`](climatology/) - compact monthly score archive for future held-out seasons.
- [`candidate-baseline.json`](candidate-baseline.json) - current recomputed baseline and
  spatial-fold results for parameter/static-feature experiments.

## Reproduction

```bash
python scripts/qa_model_report.py
python -m pytest tests/test_qa_season_metrics.py tests/test_season_gate.py tests/test_qa_candidate_spatial.py
```

Candidate parameters and new static components are evaluated with
`scripts/qa_candidate_spatial.py`; see [`CANDIDATES.md`](CANDIDATES.md) for its frozen-fold
workflow.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or args.root / "report.md"
    output.write_text(render(args.root), encoding="utf-8")
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
