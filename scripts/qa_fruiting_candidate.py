#!/usr/bin/env python3
"""Compare a candidate fruiting_fit.json with the shipped one before it ships.

Each file's weather part is computed as fp.fruiting_weather_part computes it, but from the file's
own feature list (fruiting_design(..., names=spec["features"])), so an old and a new feature set
run side by side in this code. Where a file has no model for a species-region the hand-set weather
part stands in; a species-region with a shipped GBM is left out (the GBM overrides the fit).

  (a) places: each find's own day against up to 10 bracket-fungus finds in its region that day
      elsewhere, all training years (ERA5), on the full score (tools/fit_fruiting_parts.place_parts
      and full_score), 95% CI resampling weeks;
  (b) summer: the summer 2026 strata (scripts/qa_spatial_weights.py), the app's stored weather,
      scored by calculate_mushroom_score with each file's weather part;
  (c) autumn: the share of in-range places (range prior >= 0.5) at 4+ and 5+ in September,
      October and November 2023-2025, ERA5 days at a sample of map places, scored as (b). Hand-set
      parts read raw ERA5 humidity here, higher than the app's stored humidity: compare before
      with after, do not quote the shares as production's.

    python scripts/qa_fruiting_candidate.py --candidate X.json --out ../era5_training [--checks a,b,c]
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import json
import subprocess
import sys
import tempfile
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend" / "tools"), str(ROOT / "scripts")]
import era5_normals  # noqa: E402
import forecast_pipeline as fp  # noqa: E402
from fit_fruiting import CONTINENT, PLACEBO, find_day_rank, strata, transform  # noqa: E402
from fit_fruiting_parts import PARTS, STORED_WITH, full_score, place_parts, places, weather, wide  # noqa: E402
from fit_plant_settings import paired_ci, static_info  # noqa: E402
from qa_season_branch_replay import BRANCH_LAG_COLUMNS  # noqa: E402
from qa_spatial_weights import MIN_CASES, region_config, stack  # noqa: E402
from qa_weather_skill import LAG_DAYS  # noqa: E402
from range_prior import grid_values  # noqa: E402

LAGS = [*BRANCH_LAG_COLUMNS, *fp.FRUITING_LAG_COLUMNS]
AUTUMN_YEARS, AUTUMN_PLACES, AUTUMN_STEP = (2023, 2024, 2025), 300, 3


def shipped_default() -> Path:
    """main's fruiting_fit.json: on a refit branch the working copy is the candidate."""
    text = subprocess.run(["git", "show", "origin/main:backend/generated/fruiting_fit.json"], cwd=ROOT,
                          capture_output=True, text=True, encoding="utf-8", check=True).stdout
    path = Path(tempfile.gettempdir()) / "fruiting_fit_main.json"
    path.write_text(text, encoding="utf-8")
    return path


def fitted_part(raw, lats, lons, dates, spec, model, region, stored) -> np.ndarray:
    """fp.fruiting_weather_part with the file's own features: warmth on the scored day where the
    features use it, stored humidity put on ERA5's level only for stored weather, departures from
    the place's normals where the file says so, then the model's monthly map."""
    normals = era5_normals.load(region)
    dates = pd.Series(pd.to_datetime(np.asarray(dates)))
    names = spec["features"]
    warmth = fp.fruiting_warmth(normals, lats, lons, dates) if any(n.endswith("_x_warmth") for n in names) else None
    design = fp.fruiting_design(raw.reset_index(drop=True), warmth, names=names)
    if stored:
        a, b = spec["humidity_from_stored"][region]
        design[["humidity", "humidity_early"]] = a + b * design[["humidity", "humidity_early"]]
    if spec.get("relative_to_normal"):
        design = fp.fruiting_relative(design, normals, lats, lons, dates)
    z = (design.to_numpy(float) - np.asarray(spec["means"])) / np.asarray(spec["sds"])
    eta = np.nan_to_num(z, nan=0.0) @ np.asarray(model["beta"], float)
    return fp._monthly_map(eta, dates, model["map"])


def _patched_weather_part(df, model):
    return fitted_part(fp.fruiting_raw_features(df), df["Latitude"], df["Longitude"], df["Date"],
                       model["spec"], model, model["region"], stored=model["stored"])


fp.fruiting_weather_part = _patched_weather_part      # calculate_mushroom_score looks it up at call time


def with_fit(params: dict, spec: dict, species: str, region: str, stored: bool) -> dict:
    """The species' production params with this file's model, or with none (hand-set), and the
    file's hand-set settings for it ("settings": {species: {region: {name: value}}}), if any."""
    p = {k: v for k, v in params.items() if k != "fruiting"}
    p.update(spec.get("settings", {}).get(species, {}).get(region, {}))
    model = spec["models"].get(species, {}).get(region)
    if model:
        p["fruiting"] = {**model, "spec": spec, "region": region, "stored": stored}
    return p


def pairs_to_check(shipped, candidate) -> list:
    """Species-regions whose model differs between the files, GBM-shipped ones left out."""
    gbm = json.loads((ROOT / "backend/generated/fruiting_gbm.json").read_text(encoding="utf-8"))["models"]
    keys = {(s, r) for spec in (shipped, candidate) for s, regions in spec["models"].items() for r in regions}
    differ = [k for k in keys if shipped["models"].get(k[0], {}).get(k[1]) != candidate["models"].get(k[0], {}).get(k[1])]
    differ += [(s, r) for s, regions in candidate.get("settings", {}).items() for r in regions]
    return sorted(k for k in set(differ) if k[1] not in gbm.get(k[0], {}).get("regions", {}))


def check_places(out: Path, shipped, candidate, pairs) -> pd.DataFrame:
    table = pd.concat([t for t in (pd.read_parquet(p) for p in (out / "training").glob("*.parquet")) if len(t)], ignore_index=True)
    scores = pd.concat([s for s in (pd.read_parquet(p) for p in (out / "training_scores").glob("*.parquet")) if len(s)],
                       ignore_index=True)
    cases, _, mask = strata(table, transform(table))
    slot0 = table[table["offset"] == 0].drop_duplicates("case_id").set_index("case_id").reindex(cases["case_id"]).reset_index()
    is_placebo, regions = (cases["species"] == PLACEBO).to_numpy(), cases["region"].to_numpy()
    found = pd.to_datetime(cases["find_date"])
    weeks = (found.dt.isocalendar().year * 100 + found.dt.isocalendar().week).to_numpy(int)
    dates = found.to_numpy().astype("datetime64[D]").astype(np.int64)
    sites = slot0["Location_Id"].to_numpy()
    base = pd.concat([pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(f"{r}_BASE_DATA")).decode("utf-8")),
                                  usecols=["Location_Id", "Latitude", "Longitude"]) for r in ("NE", "SE", "USE", "USW")]
                     ).drop_duplicates("Location_Id").set_index("Location_Id")
    statics, specs, rows = {c: static_info(c) for c in ("EU", "US")}, {}, []
    for species, region in pairs:
        own = scores[scores["species"] == species]
        parts = {name: wide(own, cases, name)[:, 0] for name, _ in PARTS.values()}
        stored = wide(own, cases, "weather_part")[:, 0]
        here = np.flatnonzero(((cases["species"] == species).to_numpy() | is_placebo) & (regions == region)
                              & mask[:, 0] & np.isfinite(stored))
        if region not in specs:
            specs[region] = fp._load_species_and_curves(region_config(region))
        # The place parts need no weather model; the one production attached from the working
        # copy's fit file would go through the patched weather part without its file's spec.
        params = {k: v for k, v in specs[region][0][species].items() if k not in ("fruiting", "fruiting_gbm")}
        today = {k: float(params.get(k, default)) for k, (_, default) in PARTS.items()}
        p, wind = {k: v[here] for k, v in parts.items()}, stored[here] / weather({k: v[here] for k, v in parts.items()},
                                                                                     STORED_WITH, np.ones(len(here)))
        r = slot0.iloc[here]

        def index(spec):
            model = spec["models"].get(species, {}).get(region)
            if model is None:
                return weather(p, today, wind)
            return fitted_part(r, r["cell_lat"].to_numpy(float), r["cell_lon"].to_numpy(float), r["date"],
                               spec, model, region, stored=False) * wind

        place = place_parts(species, params, specs[region][1], sites[here], dates[here], base, statics[CONTINENT[region]])
        result = places(full_score(index(shipped), today, wind, place), full_score(index(candidate), today, wind, place),
                        (cases["species"] == species).to_numpy()[here], is_placebo[here], dates[here], sites[here], weeks[here])
        rows.append({"species": species, "region": region, **result})
        print(rows[-1], flush=True)
    return pd.DataFrame(rows)


def check_summer(out: Path, shipped, candidate, pairs) -> pd.DataFrame:
    layout_all = pd.read_parquet(out / "spatial" / "spatial_strata.parquet",
                                 columns=["case", "slot", "species", "Location_Id", "Date", "region"])
    layout_all["Date"] = pd.to_datetime(layout_all["Date"]).dt.normalize()
    rows = []
    for region in sorted({r for _, r in pairs}):
        species_here = [s for s, r in pairs if r == region]
        layout = layout_all[(layout_all["region"] == region) & layout_all["species"].isin(species_here)]
        if layout.empty:
            continue
        params, zone_curves = fp._load_species_and_curves(region_config(region))
        history = pd.read_parquet(next((out / "acceptance_cache").glob(f"stored-{region}-*.parquet")))
        history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
        frame = fp.compute_lag_features(history, LAGS, LAG_DAYS, target=history.merge(
            layout[["Location_Id", "Date"]].drop_duplicates(), on=["Location_Id", "Date"]))
        frame = frame.drop_duplicates(["Location_Id", "Date"], keep="last").reset_index(drop=True)
        for species in species_here:
            table = layout[layout["species"] == species]
            if table["case"].nunique() < MIN_CASES:
                continue
            day = frame[frame["Date"].isin(table["Date"].unique())].reset_index(drop=True)
            scored = day[["Location_Id", "Date"]].copy()
            for name, spec in (("before", shipped), ("after", candidate)):
                p = with_fit(params[species], spec, species, region, stored=True)
                scored[name] = fp.calculate_mushroom_score(day.copy(), {species: p}, zone_curves)[f"{species}_score"].to_numpy()
            x, m, _ = stack(table.merge(scored, on=["Location_Id", "Date"], how="left"), ["before", "after"])
            before, after = find_day_rank(x[..., 0], m), find_day_rank(x[..., 1], m)
            rows.append({"species": species, "region": region, "finds": len(before), "before": round(float(before.mean()), 4),
                         "after": round(float(after.mean()), 4), "ci": paired_ci(after, before)})
            print(rows[-1], flush=True)
    return pd.DataFrame(rows)


def era5_frame(region: str, out: Path) -> pd.DataFrame:
    """AUTUMN_PLACES map places of the region on every AUTUMN_STEP-th day of Sep-Nov, ERA5 weather
    from their cells with every lag the scorer reads, statics from the nearest static point."""
    from scipy.spatial import cKDTree
    places_ = pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(f"{region}_BASE_DATA")).decode("utf-8")),
                          usecols=["Location_Id", "Latitude", "Longitude"]).drop_duplicates("Location_Id")
    places_ = places_.sample(min(AUTUMN_PLACES, len(places_)), random_state=291)
    places_["cell_lat"] = (np.round(places_["Latitude"] / 0.25) * 0.25).round(2)
    places_["cell_lon"] = (np.round(places_["Longitude"] / 0.25) * 0.25).round(2)
    places_["block"] = [f"{np.floor(a / 0.5) * 0.5:.2f}_{np.floor(b / 0.5) * 0.5:.2f}" for a, b in zip(places_["cell_lat"], places_["cell_lon"])]
    static = static_info(CONTINENT[region])
    near = cKDTree(static[["Latitude", "Longitude"]].to_numpy(float)).query(places_[["Latitude", "Longitude"]].to_numpy(float))[1]
    for col, src in (("Elevation (m)", "Altitude"), ("ph_level", "ph_level"), ("dist_m_water", "dist_m_water"),
                     ("dist_m_sea", "dist_m_sea"), ("climate_zone", "climate_zone")):
        places_[col] = static[src].to_numpy()[near]
    targets = pd.DatetimeIndex([d for y in AUTUMN_YEARS for d in pd.date_range(f"{y}-09-01", f"{y}-11-30", freq=f"{AUTUMN_STEP}D")])
    pieces = []
    for block, here in places_.groupby("block"):
        path = out / "era5_blocks" / f"{block}.parquet"
        if not path.exists():
            continue
        w = pd.read_parquet(path)
        w["Date"] = pd.to_datetime(w["Date"]).dt.normalize()
        w = w[w["Date"].dt.month.between(7, 11) & w["Date"].dt.year.isin(AUTUMN_YEARS)]
        w = w.rename(columns={"Latitude": "cell_lat", "Longitude": "cell_lon"})
        w["cell_lat"], w["cell_lon"] = w["cell_lat"].round(2), w["cell_lon"].round(2)
        pieces.append(here.merge(w, on=["cell_lat", "cell_lon"]))
    history = pd.concat(pieces, ignore_index=True)
    history["Wind Speed (m/s)"] = history["Wind Speed (kph)"] / 3.6
    history["Pressure (hPa)"] = np.nan
    frame = fp.compute_lag_features(history, LAGS, LAG_DAYS, target=history[history["Date"].isin(targets)])
    return frame.drop_duplicates(["Location_Id", "Date"], keep="last").reset_index(drop=True)


def check_autumn(out: Path, shipped, candidate, pairs) -> pd.DataFrame:
    rows = []
    for region in sorted({r for _, r in pairs}):
        params, zone_curves = fp._load_species_and_curves(region_config(region))
        frame = era5_frame(region, out)
        month = frame["Date"].dt.month.to_numpy()
        for species in [s for s, r in pairs if r == region]:
            prior = (np.asarray(grid_values(frame, params[species]["range_prior"]), float)
                     if "range_prior" in params[species] else np.ones(len(frame)))
            scores = {}
            for name, spec in (("before", shipped), ("after", candidate)):
                p = with_fit(params[species], spec, species, region, stored=False)
                scores[name] = fp.calculate_mushroom_score(frame.copy(), {species: p}, zone_curves)[f"{species}_score"].to_numpy()
            for m, label in ((9, "Sep"), (10, "Oct"), (11, "Nov")):
                sel = (month == m) & (prior >= 0.5)
                if sel.sum() < 30:
                    continue
                rows.append({"species": species, "region": region, "month": label, "place-days": int(sel.sum()),
                             **{f"{k} 4+": round(float((v[sel] >= 4).mean()), 3) for k, v in scores.items()},
                             **{f"{k} 5+": round(float((v[sel] >= 5).mean()), 3) for k, v in scores.items()}})
            print(species, region, "done", flush=True)
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--shipped", help="default: origin/main's backend/generated/fruiting_fit.json")
    parser.add_argument("--out", required=True, help="the training folder (training/, training_scores/, spatial/, era5_blocks/)")
    parser.add_argument("--checks", default="a,b,c")
    parser.add_argument("--report", default=".", help="where the CSVs go")
    args = parser.parse_args()
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    out, report = Path(args.out), Path(args.report)
    shipped = json.loads(Path(args.shipped or shipped_default()).read_text(encoding="utf-8"))
    candidate = json.loads(Path(args.candidate).read_text(encoding="utf-8"))
    candidate.setdefault("models", shipped["models"])
    if candidate.get("settings") and "a" in args.checks.split(","):
        print("(a) skipped: a settings change needs its weather parts recomputed (tools/fit_rain_delay.py --test)")
        args.checks = ",".join(c for c in args.checks.split(",") if c != "a")
    pairs = pairs_to_check(shipped, candidate)
    print(f"{len(pairs)} species-regions differ: {pairs}", flush=True)
    pd.set_option("display.width", 220)
    for key, fn, name in (("a", check_places, "places"), ("b", check_summer, "summer"), ("c", check_autumn, "autumn")):
        if key in args.checks.split(","):
            result = fn(out, shipped, candidate, pairs)
            result.to_csv(report / f"candidate_{name}.csv", index=False)
            print(f"== ({key}) {name}\n{result.to_string(index=False)}", flush=True)


if __name__ == "__main__":
    main()
