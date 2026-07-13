"""One-time migration: bake each base point's nearest fetched coordinate into the
base file as `coord_lat`/`coord_lon` columns.

Once baked, forecast_pipeline._join_to_base skips the per-run KDTree nearest search
and joins weather to base on these columns (a plain key merge). The mapping is stable
until the coordinate grid or base set is rebuilt, so this only needs re-running then.

IMPORTANT: the nearest-neighbour metric here is byte-for-byte the same as the runtime
fallback — a cKDTree on raw (Latitude, Longitude) — so a baked run and an un-baked run
assign every base point to the same coord.

Usage (from backend/):
  uv run python -m funges_backend.tools.bake_base_coord_keys                 # all regions, LOCAL dry-run
  uv run python -m funges_backend.tools.bake_base_coord_keys NE SE           # subset, LOCAL dry-run
  uv run python -m funges_backend.tools.bake_base_coord_keys --upload        # write back to R2 (prod)
  uv run python -m funges_backend.tools.bake_base_coord_keys NE --out-dir /tmp/baked

Dry-run writes <out-dir>/<REGION>_base_baked.csv and prints a summary; nothing is
uploaded unless --upload is passed.
"""
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from funges_backend import forecast_pipeline as fp
from funges_backend.tools.regions import REGIONS

_REPO_ROOT = Path(__file__).resolve().parents[4]


def bake_region(name, config, *, upload, out_dir):
    base_path = fp.get_required_env(config.base_env)
    coords_path = fp.get_required_env(config.coordinates_env)
    ndp = config.ndp

    base_df = fp.read_df_from_source(base_path).copy()
    coords = np.round(fp._load_coords_any(coords_path), ndp)  # (lat, lon), matches fetched keys

    tree = cKDTree(coords)                                    # raw lat/lon, == runtime fallback
    _, idx = tree.query(base_df[["Latitude", "Longitude"]].to_numpy())
    base_df["coord_lat"] = coords[idx, 0]
    base_df["coord_lon"] = coords[idx, 1]

    n_coords_used = len({tuple(c) for c in coords[idx]})
    print(f"{name}: {len(base_df)} base points -> {n_coords_used}/{len(coords)} coords used "
          f"(avg {len(base_df)/max(n_coords_used,1):.1f} base/coord)")

    if upload:
        fp.save_df_to_file(base_df, base_path)
    else:
        out = Path(out_dir) / f"{name}_base_baked.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        base_df.to_csv(out, index=False)
        print(f"   dry-run -> {out}")


def main():
    argv = sys.argv[1:]
    upload = "--upload" in argv
    argv = [a for a in argv if a != "--upload"]
    out_dir = "."
    if "--out-dir" in argv:
        i = argv.index("--out-dir")
        out_dir = argv[i + 1]
        del argv[i:i + 2]
    names = [a.upper() for a in argv if a.upper() in REGIONS] or list(REGIONS)

    fp.load_dotenv(_REPO_ROOT / ".env")
    fp.load_dotenv(_REPO_ROOT / ".env.secret")

    print(f"{'UPLOAD to R2' if upload else 'DRY-RUN (local only)'} | regions: {', '.join(names)}")
    for name in names:
        bake_region(name, REGIONS[name], upload=upload, out_dir=out_dir)


if __name__ == "__main__":
    main()
