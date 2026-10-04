#!/usr/bin/env python3
"""Fetch 1991–2020 monthly mean temperatures for the bloom forecast.

The bloom model runs on observed and forecast temperatures up to a week ahead. For
the days after that it needs what a normal year brings, so each macro gets NASA
POWER's 1991–2020 monthly T2M climatology (MERRA-2, 0.5° x 0.625°) with the grid
elevation, which backend/bloom.py interpolates to days and adjusts to each point's
elevation. NASA POWER data are free of restrictions; see NOTICE.md.

    python backend/tools/build_bloom_normals.py        # writes backend/generated/
"""
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

URL = ("https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters=T2M&community=AG"
       "&latitude-min={s}&latitude-max={n}&longitude-min={w}&longitude-max={e}&start=1991&end=2020&format=JSON")
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
# The API serves boxes of at most 10°. Edges on multiples of 10° keep every box on
# the native grid, so neighbouring boxes share their edge points exactly.
MACROS = {"EU": {"lat": (30, 75), "lon": (-30, 50)}, "US": {"lat": (20, 50), "lon": (-130, -60)}}
OUT = Path(__file__).resolve().parents[1] / "generated"


def fetch(s, n, w, e):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(URL.format(s=s, n=n, w=w, e=e), timeout=120) as r:
                return json.load(r)["features"]
        except Exception as exc:  # the API drops the odd request under load
            print(f"  retry {s},{w}: {exc}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"POWER box {s},{n},{w},{e} failed")


def build(macro):
    box = MACROS[macro]
    points = {}
    for s in range(box["lat"][0], box["lat"][1], 10):
        for w in range(box["lon"][0], box["lon"][1], 10):
            n, e = min(s + 10, box["lat"][1]), min(w + 10, box["lon"][1])
            for f in fetch(s, n, w, e):
                lon, lat, elev = f["geometry"]["coordinates"]
                t = f["properties"]["parameter"]["T2M"]
                if all(t[m] > -900 for m in MONTHS):  # -999 is POWER's fill value
                    points[(round(lat, 3), round(lon, 3))] = [elev] + [t[m] for m in MONTHS]
            print(f"{macro} {s},{w}: {len(points)} points", file=sys.stderr)
    keys = sorted(points)
    rows = np.array([points[k] for k in keys], dtype=np.float32)
    buf = io.BytesIO()
    np.savez_compressed(buf, lat=np.array([k[0] for k in keys], np.float32),
                        lon=np.array([k[1] for k in keys], np.float32),
                        elev=rows[:, 0], t2m=rows[:, 1:])
    path = OUT / f"bloom_normals_{macro}.npz"
    path.write_bytes(buf.getvalue())
    print(f"wrote {path} ({len(keys)} points, {path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    for macro in sys.argv[1:] or MACROS:
        build(macro)
