"""Evaluate candidate parameters and static components on the frozen QA cohort.

This is the experiment-facing counterpart to ``qa_weather_spatial.py``. It keeps the
committed GBIF matches fixed, recomputes scores from raw weather, and can overlay:

* species-parameter changes, without editing production parameter files; and
* precomputed location features as additional weighted geometric components.

The output includes deterministic spatial-block folds. Use an untouched fold for the
final promotion decision after exploring candidates on the remaining folds.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from qa_season_analysis import (
    CLIMATOLOGY_YEARS,
    MIN_CLIMATOLOGY_RECORDS,
    month_labels,
    monthly_rate,
)
from qa_season_branch_replay import BRANCH_LAG_COLUMNS, BRANCH_LAG_DAYS, add_lags, load_specs
from qa_season_scan import FUNGI
from qa_weather_skill import FIRST_SCORED, decompose
from qa_weather_spatial import read_history, within_day_auc

DEFAULT_QA = Path("docs/qa/model-evaluation-2026")


def deep_merge(base: dict, overlay: dict) -> dict:
    """Return a recursive dictionary merge without mutating either input."""
    result = copy.deepcopy(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def apply_parameter_overrides(params: dict, candidate: dict, region: str) -> dict:
    """Apply global and region-specific species overlays from a candidate spec."""
    output = copy.deepcopy(params)
    overlays = [candidate.get("parameter_overrides", {}).get("species", {})]
    overlays.append(
        candidate.get("parameter_overrides", {})
        .get("regions", {})
        .get(region, {})
        .get("species", {})
    )
    for overlay in overlays:
        for species, values in overlay.items():
            if species not in output:
                raise KeyError(f"candidate overrides unknown species {species!r} in {region}")
            output[species] = deep_merge(output[species], values)
    return output


def spatial_block_folds(
    latitude: pd.Series,
    longitude: pd.Series,
    *,
    folds: int,
    block_degrees: float,
) -> np.ndarray:
    """Assign deterministic geographic blocks, keeping every block in one fold."""
    if folds < 2:
        raise ValueError("folds must be at least 2")
    if block_degrees <= 0:
        raise ValueError("block_degrees must be positive")
    lat_block = np.floor(pd.to_numeric(latitude).to_numpy(float) / block_degrees).astype(int)
    lon_block = np.floor(pd.to_numeric(longitude).to_numpy(float) / block_degrees).astype(int)
    # Integer mixing is stable across Python processes, unlike hash().
    mixed = (lat_block.astype(np.int64) * 73_856_093) ^ (lon_block.astype(np.int64) * 19_349_663)
    return np.mod(mixed, folds).astype(int)


def read_feature_table(path: str | None, region: str) -> pd.DataFrame | None:
    if not path:
        return None
    resolved = Path(path.format(region=region))
    if resolved.is_dir():
        parquet = resolved / f"{region}.parquet"
        csv = resolved / f"{region}.csv"
        resolved = parquet if parquet.exists() else csv
    if not resolved.exists():
        raise FileNotFoundError(f"candidate feature table not found: {resolved}")
    frame = (
        pd.read_parquet(resolved)
        if resolved.suffix.lower() == ".parquet"
        else pd.read_csv(resolved)
    )
    if "region" in frame.columns:
        frame = frame[frame.region.astype(str) == region].copy()
    return frame


def merge_candidate_features(frame: pd.DataFrame, features: pd.DataFrame | None) -> pd.DataFrame:
    if features is None:
        return frame
    if "Location_Id" in features.columns:
        keys = ["Location_Id"]
    elif {"Latitude", "Longitude"}.issubset(features.columns):
        keys = ["Latitude", "Longitude"]
    else:
        raise ValueError("candidate features need Location_Id or Latitude and Longitude")
    duplicate = features.duplicated(keys, keep=False)
    if duplicate.any():
        examples = features.loc[duplicate, keys].head().to_dict("records")
        raise ValueError(f"candidate features contain duplicate keys: {examples}")
    candidate_columns = [column for column in features.columns if column not in {*keys, "region"}]
    overlap = set(candidate_columns) & set(frame.columns)
    if overlap:
        raise ValueError(
            f"candidate feature columns already exist in score frame: {sorted(overlap)}"
        )
    return frame.merge(
        features[[*keys, *candidate_columns]],
        on=keys,
        how="left",
        validate="many_to_one",
    )


def candidate_components(
    frame: pd.DataFrame, candidate: dict, species: str
) -> dict[str, tuple[np.ndarray, float]]:
    output = {}
    for name, spec in candidate.get("components", {}).items():
        column = spec.get("species_columns", {}).get(species, spec.get("column"))
        weight = float(spec.get("species_weights", {}).get(species, spec.get("weight", 0.0)))
        if not column or weight <= 0:
            continue
        if column not in frame.columns:
            raise KeyError(f"candidate component {name!r} needs missing column {column!r}")
        values = pd.to_numeric(frame[column], errors="coerce").to_numpy(float)
        missing = ~np.isfinite(values)
        if missing.any():
            if "missing_value" not in spec:
                raise ValueError(
                    f"candidate component {name!r} has {int(missing.sum())} missing values; "
                    "provide complete features or an explicit missing_value"
                )
            values = np.where(missing, float(spec["missing_value"]), values)
        output[name] = (values, weight)
    return output


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_or_cache_history(
    region: str,
    locations: set[str],
    cache_dir: Path,
    *,
    refresh: bool,
) -> tuple[pd.DataFrame, Path]:
    """Freeze the raw candidate cohort so later sweeps use identical weather rows."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"candidate-history-{region}.parquet"
    if path.exists() and not refresh:
        history = pd.read_parquet(path)
        history["Date"] = pd.to_datetime(history.Date).dt.normalize()
        return history, path
    history, _background = read_history(region, locations)
    history.to_parquet(path, index=False)
    return history, path


def read_or_cache_specs(
    session: requests.Session,
    region: str,
    cache_dir: Path,
    *,
    refresh: bool,
) -> tuple[dict, dict, Path]:
    """Freeze production parameters and curves alongside the raw weather cohort."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"candidate-specs-{region}.json"
    if path.exists() and not refresh:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload["params"], payload["zone_curves"], path
    params, zone_curves = load_specs(session, region)
    path.write_text(
        json.dumps({"params": params, "zone_curves": zone_curves}, indent=2),
        encoding="utf-8",
    )
    return params, zone_curves, path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True, help="JSON candidate specification")
    parser.add_argument(
        "--features",
        help="CSV/Parquet table, directory, or path containing {region}",
    )
    parser.add_argument(
        "--truth",
        default=str(DEFAULT_QA / "seasonal-ground-truth/gbif-season-truth.json"),
    )
    parser.add_argument("--scan", default=str(DEFAULT_QA / "seasonal-timing"))
    parser.add_argument("--regions", default="NE,SE")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--block-degrees", type=float, default=2.0)
    parser.add_argument("--holdout-fold", type=int)
    parser.add_argument("--history-cache", type=Path, default=DEFAULT_QA / "candidate-snapshot")
    parser.add_argument("--refresh-history", action="store_true")
    parser.add_argument("--output", default=str(DEFAULT_QA / "candidate-spatial.json"))
    args = parser.parse_args()

    candidate_path = Path(args.candidate)
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    truth_path = Path(args.truth)
    truth = json.loads(truth_path.read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es candidate spatial QA"
    first = pd.Timestamp(FIRST_SCORED)
    results = {}
    history_sources = {}

    for region in args.regions.split(","):
        matched_path = Path(args.scan) / f"observation-scores-{region}.csv"
        matched = pd.read_csv(matched_path)
        matched["Date"] = pd.to_datetime(matched.date)
        matched = matched[matched.Date >= first]
        history, history_path = read_or_cache_history(
            region,
            set(matched.location_id.dropna()),
            args.history_cache,
            refresh=args.refresh_history,
        )
        history_sources[region] = {
            "path": history_path.as_posix(),
            "sha256": file_sha256(history_path),
            "rows": len(history),
        }
        frame = add_lags(history, BRANCH_LAG_COLUMNS, BRANCH_LAG_DAYS)
        frame = frame[frame.Date >= first].reset_index(drop=True)
        frame = merge_candidate_features(frame, read_feature_table(args.features, region))
        params, zone_curves, specs_path = read_or_cache_specs(
            session,
            region,
            args.history_cache,
            refresh=args.refresh_history,
        )
        history_sources[region]["specs_path"] = specs_path.as_posix()
        history_sources[region]["specs_sha256"] = file_sha256(specs_path)
        params = apply_parameter_overrides(params, candidate, region)
        results[region] = {}

        for species in FUNGI:
            records = sum(
                sum(truth["climatology_monthly"][region][species][year].values())
                for year in CLIMATOLOGY_YEARS
            )
            if records < MIN_CLIMATOLOGY_RECORDS:
                continue
            rates = monthly_rate(truth, region, species)
            if not np.isfinite(rates).any():
                continue
            in_season, _dead = month_labels(rates)
            found = matched[(matched.species_id == species) & matched.Date.dt.month.isin(in_season)]
            if len(found) < 20:
                continue
            cases = set(zip(found.location_id, found.Date.dt.strftime("%Y-%m-%d")))

            allowed = params[species].get("climate_zones", [])
            eligible = frame[frame.climate_zone.isin(allowed)].copy() if allowed else frame.copy()
            extras = candidate_components(eligible, candidate, species)
            scored = decompose(
                eligible,
                species,
                params,
                zone_curves,
                candidate_components=extras,
            )
            scored = scored[scored.Date.dt.month.isin(in_season)].copy()
            if scored.empty:
                continue
            scored["fold"] = spatial_block_folds(
                scored.Latitude,
                scored.Longitude,
                folds=args.folds,
                block_degrees=args.block_degrees,
            )
            scored["weather_climate"] = scored.groupby("Location_Id").weather_part.transform("mean")
            scored["weather_anomaly"] = scored.weather_part - scored.weather_climate
            evaluated = (
                scored
                if args.holdout_fold is None
                else scored[scored.fold == args.holdout_fold]
            )

            entry = {"candidate_components": sorted(extras), "folds": {}}
            columns = (
                "static_part",
                "weather_part",
                "weather_climate",
                "weather_anomaly",
                "full_score",
            )
            for column in columns:
                value, used = within_day_auc(evaluated, cases, column)
                entry[column] = None if value is None else round(value, 4)
                entry[f"{column}_n"] = used
            for fold in range(args.folds):
                fold_entry = {}
                fold_frame = scored[scored.fold == fold]
                for column in columns:
                    value, used = within_day_auc(fold_frame, cases, column)
                    fold_entry[column] = None if value is None else round(value, 4)
                    fold_entry[f"{column}_n"] = used
                entry["folds"][str(fold)] = fold_entry
            results[region][species] = entry

    output = {
        "schema_version": 1,
        "candidate": candidate,
        "evaluation": {
            "regions": args.regions.split(","),
            "first_scored": FIRST_SCORED,
            "folds": args.folds,
            "block_degrees": args.block_degrees,
            "holdout_fold": args.holdout_fold,
            "candidate_sha256": file_sha256(candidate_path),
            "truth_sha256": file_sha256(truth_path),
            "scan": Path(args.scan).as_posix(),
            "features": args.features,
            "history": history_sources,
        },
        "results": results,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"wrote {output_path}")


if __name__ == "__main__":
    main()
