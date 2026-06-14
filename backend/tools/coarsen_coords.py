"""Phase 3 (non-breaking): build COARSER fetch-coordinate files to stop calling
WeatherAPI for multiple coords that resolve to the same station.

Writes NEW R2 keys (…_coarse.json / …_coarse.csv) — the current files are never
touched, so production on `main` keeps running until the feature branch (whose .env
points at the _coarse files) is merged.

Thinning is a LATITUDE-CORRECTED grid: a constant ~S km cell in both axes (lon cell
widened by 1/cos(lat)), so the polar longitude over-sampling is removed. One coord is
kept per cell (the one nearest the cell centre, deterministic). The base file is then
re-baked (nearest coarse coord -> coord_lat/coord_lon) and written to a new key, so the
Phase-0 fast join + Phase-2 dedup keep working against the coarse grid.

Usage:
  python backend/tools/coarsen_coords.py                 # all regions, LOCAL dry-run
  python backend/tools/coarsen_coords.py NE --km 10      # one region, set spacing
  python backend/tools/coarsen_coords.py --upload        # write _coarse keys to R2
"""
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from scipy.spatial import cKDTree

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))
import forecast_pipeline as fp
from run_subset_proof import REGIONS

DEFAULT_KM = 10.0


def _coarse_url(url, suffix):
    p = Path(urlparse(url).path)
    stem = url.rsplit("/", 1)[-1]
    new_name = stem.replace(p.suffix, f"_coarse{p.suffix}")
    return url.rsplit("/", 1)[0] + "/" + new_name


def thin_min_separation(coords, km):
    """Greedy decimation that GUARANTEES no two kept coords are closer than `km`
    (great-circle). Poisson-disk style: scan in a deterministic order, keep a coord,
    drop every not-yet-kept coord within `km` of it. This directly enforces "never
    fetch two coords that would resolve to the same station" up to the chosen radius,
    and adapts to local density (keeps as many distinct points as the radius allows).
    """
    lat, lon = coords[:, 0], coords[:, 1]
    latr, lonr = np.radians(lat), np.radians(lon)
    xyz = np.column_stack([np.cos(latr) * np.cos(lonr), np.cos(latr) * np.sin(lonr), np.sin(latr)])
    radius = 2.0 * np.sin(km / (2.0 * 6371.0))      # chord length for `km` on the unit sphere
    tree = cKDTree(xyz)
    order = np.lexsort((lon, lat))                   # deterministic, independent of input order
    kept = np.zeros(len(coords), dtype=bool)
    removed = np.zeros(len(coords), dtype=bool)
    for i in order:
        if removed[i]:
            continue
        kept[i] = True
        for j in tree.query_ball_point(xyz[i], radius):
            if j != i and not kept[j]:
                removed[j] = True
    return coords[kept]


def _put_json_to_r2(url, obj):
    import boto3
    key = urlparse(url).path.lstrip("/")
    payload = json.dumps([[f"{lat:.{fp.NDP}f}", f"{lon:.{fp.NDP}f}"] for lat, lon in obj],
                         ensure_ascii=False, indent=4) + "\n"
    boto3.client("s3",
                 endpoint_url=fp.get_required_env("R2_ENDPOINT_URL"),
                 aws_access_key_id=fp.get_required_env("R2_ACCESS_KEY_ID"),
                 aws_secret_access_key=fp.get_required_env("R2_SECRET_ACCESS_KEY")
                 ).put_object(Bucket=fp.get_required_env("R2_BUCKET_NAME"), Key=key,
                              Body=payload.encode("utf-8"), ContentType="application/json")
    print(f"   uploaded coords -> {url}")


def coarsen_region(name, config, km, *, upload, out_dir):
    coords_url = fp.get_required_env(config.coordinates_env)
    base_url = fp.get_required_env(config.base_env)

    coords = np.round(fp._load_coords_any(coords_url), fp.NDP)
    coarse = np.round(thin_min_separation(coords, km), fp.NDP)
    pct = (1 - len(coarse) / len(coords)) * 100
    print(f"{name}: {len(coords)} -> {len(coarse)} coords  ({pct:.0f}% fewer calls/run, ~{km:.0f} km grid)")

    base_df = fp.read_df_from_source(base_url).copy()
    for c in ("coord_lat", "coord_lon"):          # drop any stale Phase-0 bake
        if c in base_df.columns:
            base_df = base_df.drop(columns=c)
    _, idx = cKDTree(coarse).query(base_df[["Latitude", "Longitude"]].to_numpy())
    base_df["coord_lat"] = coarse[idx, 0]
    base_df["coord_lon"] = coarse[idx, 1]

    coords_out, base_out = _coarse_url(coords_url, "coarse"), _coarse_url(base_url, "coarse")
    if upload:
        _put_json_to_r2(coords_out, coarse)
        fp.save_df_to_file(base_df, base_out)
    else:
        d = Path(out_dir); d.mkdir(parents=True, exist_ok=True)
        json.dump([[f"{a:.{fp.NDP}f}", f"{b:.{fp.NDP}f}"] for a, b in coarse],
                  open(d / f"{name}_unique_coordinates_coarse.json", "w"), indent=4)
        base_df.to_csv(d / f"{name}_base_coarse.csv", index=False)
        print(f"   dry-run -> {d / f'{name}_unique_coordinates_coarse.json'}")
    return {"region": name, "before": len(coords), "after": len(coarse),
            "coords_url": coords_out, "base_url": base_out}


def main():
    argv = sys.argv[1:]
    upload = "--upload" in argv
    argv = [a for a in argv if a != "--upload"]
    km = DEFAULT_KM
    if "--km" in argv:
        i = argv.index("--km"); km = float(argv[i + 1]); del argv[i:i + 2]
    out_dir = "."
    if "--out-dir" in argv:
        i = argv.index("--out-dir"); out_dir = argv[i + 1]; del argv[i:i + 2]
    names = [a.upper() for a in argv if a.upper() in REGIONS] or list(REGIONS)

    fp.load_dotenv(_BACKEND.parent / ".env")
    fp.load_dotenv(_BACKEND.parent / ".env.secret")
    print(f"{'UPLOAD to R2' if upload else 'DRY-RUN (local only)'} | km={km} | regions: {', '.join(names)}")
    res = [coarsen_region(n, REGIONS[n], km, upload=upload, out_dir=out_dir) for n in names]
    tot_b = sum(r["before"] for r in res); tot_a = sum(r["after"] for r in res)
    print(f"\nTOTAL: {tot_b} -> {tot_a} calls/run ({(1-tot_a/tot_b)*100:.0f}% fewer).")
    if not upload:
        print("\n.env keys to point at once uploaded:")
        for r in res:
            print(f"  {r['region']}_UNIQUE_COORDINATES={r['coords_url']}")
            print(f"  {r['region']}_BASE_DATA={r['base_url']}")


if __name__ == "__main__":
    main()
