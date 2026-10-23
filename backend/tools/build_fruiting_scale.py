#!/usr/bin/env python3
"""One weather-part scale per fitted species, the same in every region (forecast_pipeline.season_scale):
the hand-set part in the species' best month, read from each region's own season curve, in every
region where the species has a fitted part and a local season, pooled with equal weights. Built here
rather than at scoring time, so a night never reads part of the regions' curves: rebuild it when the
fits or the season curves change (the nightly warns when one has), and commit backend/generated/on_r2.json.

    python backend/tools/build_fruiting_scale.py
"""
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import forecast_pipeline as fp  # noqa: E402
import r2  # noqa: E402
from seasonality import normalize_curve  # noqa: E402


def build(fit, gbm, curves, local):
    """{species: quantiles}. `fit` and `gbm` are the fit files' "models", `curves` each region's season
    curves, `local` each region's species with a local season (local_season.json). A region uses its
    GBM's map where it ships one, else its linear fit's. Fails when a species that needs the scale
    (fitted, local season) has no best month in a region: that would be a quiet fallback at night."""
    parts, holes = {}, []
    for region, region_curves in curves.items():
        for specie in sorted(local.get(region, ())):
            model = gbm.get(specie, {}).get("regions", {}).get(region) or fit.get(specie, {}).get(region)
            if not model:
                continue
            curve = region_curves.get(specie)
            best = fp.best_month_parts(model["map"], normalize_curve(curve)) if curve else None
            if best is None:
                holes.append(f"{specie} {region}")
                continue
            parts.setdefault(specie, []).append(fp.pooled_quantiles(best))
    if holes:
        raise SystemExit(f"no best month for {', '.join(holes)}: their region curve has no ratio")
    return {specie: fp.pooled_quantiles(p).round(6).tolist() for specie, p in sorted(parts.items())}


def main():
    root = Path(__file__).resolve().parents[2]
    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    fit = json.loads(Path(r2.generated(fp.FRUITING_FIT_PATH)).read_text(encoding="utf-8"))["models"]
    gbm = json.loads(Path(r2.generated(fp.FRUITING_GBM_PATH)).read_text(encoding="utf-8"))["models"]
    seasons = json.loads(fp.LOCAL_SEASON_PATH.read_text(encoding="utf-8"))["continents"]
    local = {region: set(species) for entry in seasons.values() for region, species in entry.get("regions", {}).items()}
    texts = {}
    for region in fp.FRUITING_GBM_REGIONS:
        path = fp.get_required_env(f"{region}_SEASON_CURVES")
        texts[region] = fp.r2_fetch(path).decode("utf-8") if fp.is_remote_path(path) else Path(path).read_text(encoding="utf-8")
    scales = build(fit, gbm, {region: json.loads(text) for region, text in texts.items()}, local)
    # What it was built from, so that the nightly can say when it is out of date (fp.warn_if_scale_stale).
    inputs = {**fp.scale_inputs(), "season_curves": {r: fp.season_curves_text_sha(t) for r, t in texts.items()}}
    fp.FRUITING_SCALE_PATH.write_text(json.dumps({"built": date.today().isoformat(), "inputs": inputs,
                                                  "scales": scales}, indent=1), encoding="utf-8")
    print(f"{len(scales)} species: {', '.join(scales)}")
    r2.ship(fp.FRUITING_SCALE_PATH)


if __name__ == "__main__":
    main()
