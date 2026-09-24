#!/usr/bin/env python3
"""Build per-species range priors from GBIF occurrence density and upload to R2.

A range prior answers "can this species grow here?": how likely the few (or zero)
records near a cell are if the species did grow there. Many records, or too few
observations of its kingdom to tell, mean yes; a well-observed area with almost
none of it means no. It replaces the hand-drawn climate-zone allow-lists, which
cut the map along straight lines and knew nothing about where a species grows.
"""
import argparse
import io
import json
import math
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.special import gammaincc

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from species_registry import get_range_taxon_map, get_region_species

_THIS_YEAR = date.today().year
_ROOT = Path(__file__).resolve().parents[2]

# The adhoc endpoint queries the live occurrence index. The precomputed density
# tiles lag it: 1230 vs 1668 B. edulis records on one Scottish tile.
GBIF_TILE = "https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}.mvt"
GBIF_SPECIES = "https://api.gbif.org/v1/species/{key}"
ZOOM = 4  # EPSG:4326 tiles of 11.25°; adhoc clusters records to ~0.2° at any zoom
STEP = 0.1  # grid cell, degrees
KM_PER_DEG = 111.32

# Covers every RegionConfig lat/lon range in the macro (EU = NE ∪ SE, US = USE ∪ USW).
MACROS = {
    "EU": {"lat": (34.0, 71.5), "lon": (-25.0, 42.5), "env": "EU_RANGE_PRIORS", "regions": ("NE", "SE")},
    "US": {"lat": (24.0, 49.5), "lon": (-125.5, -67.0), "env": "US_RANGE_PRIORS", "regions": ("USE", "USW")},
}

SIGMA_KM = 50.0  # smoothing radius: wide enough that one empty cell is not evidence
# Local and regional scale. Around central Kansas 50 km holds 325 fungi records, too
# few to rule B. edulis out; at 150 km the Missouri/Kansas ground has tens of
# thousands and none of it. A species must be consistent with both.
SCALES_KM = (SIGMA_KM, 150.0)
# A population this much rarer than the species' typical share still counts as
# growing there. 0.02 kept B. edulis at 0.20 in Missouri and amaranth at 0.29 in
# Ireland; 0.1 started hiding real sightings (2.6% of 2026's).
TOLERANCE = 0.05


# --- GBIF vector tiles -----------------------------------------------------

def _varint(buf, i):
    shift = result = 0
    while True:
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if b < 0x80:
            return result, i
        shift += 7


def _fields(buf):
    """Yield (field number, value) for a protobuf message."""
    i = 0
    while i < len(buf):
        key, i = _varint(buf, i)
        wire = key & 7
        if wire == 0:
            value, i = _varint(buf, i)
        elif wire == 2:
            length, i = _varint(buf, i)
            value, i = buf[i:i + length], i + length
        elif wire == 5:
            value, i = buf[i:i + 4], i + 4
        elif wire == 1:
            value, i = buf[i:i + 8], i + 8
        else:
            raise ValueError(f"unsupported protobuf wire type {wire}")
        yield key >> 3, value


def _packed(buf):
    out, i = [], 0
    while i < len(buf):
        value, i = _varint(buf, i)
        out.append(value)
    return out


def _zigzag(n):
    return (n >> 1) ^ -(n & 1)


def _tile_value(buf):
    for num, value in _fields(buf):
        if num == 1:
            return value.decode()
        if num == 2:
            return struct.unpack("<f", value)[0]
        if num == 3:
            return struct.unpack("<d", value)[0]
        if num in (4, 5):
            return value
        if num == 6:
            return _zigzag(value)
        if num == 7:
            return bool(value)
    return None


def decode_points(tile):
    """Yield (x, y, total, extent) for each point of a GBIF occurrence tile.

    ponytail: a points-only Mapbox Vector Tile reader; GBIF point tiles carry
    nothing else, so a full MVT dependency buys nothing here.
    """
    for num, layer in _fields(tile):
        if num != 3:
            continue
        keys, values, features, extent = [], [], [], 4096
        for n, value in _fields(layer):
            if n == 2:
                features.append(value)
            elif n == 3:
                keys.append(value.decode())
            elif n == 4:
                values.append(_tile_value(value))
            elif n == 5:
                extent = value
        for feature in features:
            tags, geometry = [], []
            for n, value in _fields(feature):
                if n == 2:
                    tags = _packed(value)
                elif n == 4:
                    geometry = _packed(value)
            props = {keys[tags[k]]: values[tags[k + 1]] for k in range(0, len(tags), 2)}
            total = props.get("total", 0)
            x = y = k = 0
            while k < len(geometry):
                command, count = geometry[k] & 7, geometry[k] >> 3
                k += 1
                if command != 1:  # MoveTo is the only command a point uses
                    break
                for _ in range(count):
                    x += _zigzag(geometry[k])
                    y += _zigzag(geometry[k + 1])
                    k += 2
                    yield x, y, total, extent


def _get(url, retries=6):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=90) as resp:
                return resp.read() if resp.status == 200 else b""
        except urllib.error.HTTPError as e:
            if attempt == retries - 1:
                raise
            retry_after = e.headers.get("Retry-After")
            time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else 2.0 * (attempt + 1))
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def tile_span(z):
    """Tile width in degrees for EPSG:4326 (two tiles wide at zoom 0)."""
    return 180.0 / 2 ** z


def tiles_for(macro, z=ZOOM):
    w = tile_span(z)
    xs = range(int((macro["lon"][0] + 180) // w), int((macro["lon"][1] + 180) // w) + 1)
    ys = range(int((90 - macro["lat"][1]) // w), int((90 - macro["lat"][0]) // w) + 1)
    return [(x, y) for x in xs for y in ys]


def grid_shape(macro):
    return (round((macro["lat"][1] - macro["lat"][0]) / STEP),
            round((macro["lon"][1] - macro["lon"][0]) / STEP))


def bin_tile(grid, macro, tile, x, y, z=ZOOM):
    """Add one tile's point counts into the macro grid (row 0 = southern edge)."""
    w = tile_span(z)
    for px, py, total, extent in decode_points(tile):
        if not (0 <= px < extent and 0 <= py < extent):
            continue  # tile buffer: that point belongs to the neighbouring tile
        lon = -180 + x * w + (px + 0.5) / extent * w
        lat = 90 - y * w - (py + 0.5) / extent * w
        i = int((lat - macro["lat"][0]) // STEP)
        j = int((lon - macro["lon"][0]) // STEP)
        if 0 <= i < grid.shape[0] and 0 <= j < grid.shape[1]:
            grid[i, j] += total


def count_grid(macro, taxon_key, years, workers=4):
    params = urllib.parse.urlencode({
        "srs": "EPSG:4326", "taxonKey": taxon_key,
        # Human observations only, as in the season curves: specimens carry
        # herbarium-campaign bias and are not the population the app serves.
        "basisOfRecord": "HUMAN_OBSERVATION", "year": years, "mode": "GEO_CENTROID",
    })
    grid = np.zeros(grid_shape(macro))
    tiles = tiles_for(macro)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        bodies = ex.map(lambda t: _get(GBIF_TILE.format(z=ZOOM, x=t[0], y=t[1]) + "?" + params), tiles)
        for (x, y), body in zip(tiles, bodies):
            if body:
                bin_tile(grid, macro, body, x, y)
    return grid


# --- Prior maths -----------------------------------------------------------

def lat_centers(macro):
    return macro["lat"][0] + (np.arange(grid_shape(macro)[0]) + 0.5) * STEP


def smooth_counts(grid, lats, sigma_km=SIGMA_KM):
    """Gaussian kernel-weighted record counts; the lon sigma widens with latitude."""
    sy = sigma_km / (KM_PER_DEG * STEP)
    out = gaussian_filter1d(grid.astype(float), sy, axis=0, mode="constant")
    for r, lat in enumerate(lats):
        sx = sy / max(math.cos(math.radians(lat)), 0.2)
        # gaussian_filter1d averages; the kernel mass turns that back into a count.
        out[r] = gaussian_filter1d(out[r], sx, mode="constant") * (2 * math.pi * sy * sx)
    return out


def possibility(target, background):
    """P(no more than `target` records | the species grows here at TOLERANCE x its typical share).

    A frequency would punish places where people record plants or fungi less; this
    only says no where the looking was thorough enough that the species would have
    turned up. `typical` is the share seen by the median record, so a sparse cell
    with one lucky record cannot inflate it.
    """
    present = (target >= 1) & (background > 0)
    if not present.any():
        return None
    share, weight = target[present] / background[present], target[present]
    order = np.argsort(share)
    typical = share[order][np.searchsorted(np.cumsum(weight[order]), weight.sum() / 2)]
    return gammaincc(target + 1, background * TOLERANCE * typical)


def range_prior(targets, backgrounds):
    """Prior in [0, 1]: the species must be possible at every scale (lists follow SCALES_KM)."""
    tests = [possibility(t, b) for t, b in zip(targets, backgrounds)]
    return None if any(t is None for t in tests) else np.minimum.reduce(tests)


def kingdom_key(taxon_key):
    return json.loads(_get(GBIF_SPECIES.format(key=taxon_key)))["kingdomKey"]


def build_macro(macro, taxon_map, years, workers=4):
    """{species: prior grid} for one macro region; species without evidence are left out."""
    lats = lat_centers(macro)
    backgrounds, priors = {}, {}
    for species, keys in taxon_map.items():
        kingdom = kingdom_key(keys[0])
        if kingdom not in backgrounds:
            raw_bg = count_grid(macro, kingdom, years, workers)
            backgrounds[kingdom] = [smooth_counts(raw_bg, lats, s) for s in SCALES_KM]
        raw = sum(count_grid(macro, k, years, workers) for k in keys)
        # A few records on a well-observed continent is evidence of rarity, so even
        # 20 records get a prior. None at all more likely means a wrong taxon key.
        if not raw.sum():
            print(f"  [warn] {species}: no GBIF records -- check rangePrior.taxonKeys; no prior")
            continue
        prior = range_prior([smooth_counts(raw, lats, s) for s in SCALES_KM], backgrounds[kingdom])
        if prior is None:
            print(f"  {species:22s} {int(raw.sum()):7d} records  SKIP (no cell with a record)")
            continue
        priors[species] = prior
        print(f"  {species:22s} {int(raw.sum()):7d} records  "
              f"land cells >0.5: {np.mean(prior > 0.5):.0%}")
    return priors


def to_npz(macro, priors):
    buf = io.BytesIO()
    species = sorted(priors)
    np.savez_compressed(
        buf, lat0=macro["lat"][0], lon0=macro["lon"][0], step=STEP,
        species=np.array(species),
        priors=np.stack([np.rint(priors[s] * 255).astype(np.uint8) for s in species]),
    )
    return buf.getvalue()


# --- Entry point -----------------------------------------------------------

def _curves():
    # The season-curve tool owns the R2/env helpers this build shares.
    import build_season_curves as curves
    return curves


def save(payload, dest):
    curves = _curves()
    if curves.is_remote_path(dest):
        key = urllib.parse.urlparse(dest).path.lstrip("/")
        client = curves.boto3.client(
            "s3",
            endpoint_url=curves.get_required_env("R2_ENDPOINT_URL"),
            aws_access_key_id=curves.get_required_env("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=curves.get_required_env("R2_SECRET_ACCESS_KEY"),
        )
        client.put_object(Bucket=curves.get_required_env("R2_BUCKET_NAME"), Key=key,
                          Body=payload, ContentType="application/octet-stream")
        print(f"  uploaded to R2: {dest}")
    else:
        Path(dest).parent.mkdir(parents=True, exist_ok=True)
        Path(dest).write_bytes(payload)
        print(f"  wrote local: {dest}")


def needs_rebuild():
    """Missing from R2, or last built in an earlier quarter -> rebuild."""
    curves = _curves()
    today_q = curves._quarter_index(date.today())
    for macro in MACROS.values():
        lm = curves.r2_last_modified(curves.get_required_env(macro["env"]))
        if lm is None or curves._quarter_index(lm.date()) < today_q:
            return True
    print("[gate] range priors present and built this quarter -> skipping (use --force to rebuild)")
    return False


def run(years=None, local_only=False, out_dir=".", force=False, workers=4):
    curves = _curves()
    curves.load_dotenv(_ROOT / ".env")
    curves.load_dotenv(_ROOT / ".env.secret")
    if not local_only and not force and not needs_rebuild():
        return
    # The current year stays out so QA, which scores this year's sightings, is not
    # graded on its own training data.
    years = years or f"1990,{_THIS_YEAR - 1}"
    taxon_map = get_range_taxon_map()
    for code, macro in MACROS.items():
        available = set().union(*(get_region_species(r) for r in macro["regions"]))
        macro_taxa = {sp: keys for sp, keys in taxon_map.items() if sp in available}
        print(f"[{code}] building range priors for {len(macro_taxa)} species ({years})...")
        priors = build_macro(macro, macro_taxa, years, workers)
        dest = (str(Path(out_dir) / f"{code}_range_priors.npz") if local_only
                else curves.get_required_env(macro["env"]))
        save(to_npz(macro, priors), dest)


def run_safely():
    """Scheduler hook: a failed prior build must never fail the scoring run."""
    try:
        run()
    except Exception as e:
        print(f"[warn] range prior build failed: {e}; scoring keeps the last published priors")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", help="GBIF year range (default: 1990 to last year)")
    ap.add_argument("--local-only", action="store_true", help="write to --out-dir instead of R2")
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--force", action="store_true", help="rebuild even if built this quarter")
    ap.add_argument("--workers", type=int, default=4, help="parallel GBIF tile fetches")
    args = ap.parse_args()
    run(args.years, args.local_only, args.out_dir, args.force, args.workers)


if __name__ == "__main__":
    main()
