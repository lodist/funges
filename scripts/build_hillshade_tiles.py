#!/usr/bin/env python3
"""Pre-rendered hillshade tiles for the Funges map, packed as PMTiles.

The map used to read elevation straight from the public AWS Terrain Tiles
bucket (Terrarium PNGs, ~72 KB each) and shade them on the GPU. Shading is
the only thing the map ever computes from elevation and it never changes, so
this renders it once: grey-and-alpha WebP tiles (~10 KB) served from R2 as a
plain raster layer. Same look, a sixth of the bytes, no third-party host.

Stages (each resumable, run in order):

  python scripts/build_hillshade_tiles.py download   # Terrarium PNGs -> cache
  python scripts/build_hillshade_tiles.py render     # PNG 3x3 -> WebP shade
  python scripts/build_hillshade_tiles.py pack       # WebP -> hillshade.pmtiles
  python scripts/build_hillshade_tiles.py upload     # -> R2 (needs R2_* env)

  python scripts/build_hillshade_tiles.py sample Z X Y   # one tile + preview

Coverage is the two score continents at z0-z11. Cache and output live in
../terrain_cache, outside the repo.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import functools
import io
import json
import math
import os
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT.parent / "terrain_cache"
PNG_DIR = CACHE / "terrarium"
WEBP_DIR = CACHE / "hillshade"
OUT_PMTILES = CACHE / "hillshade_z11.pmtiles"
R2_KEY = "basemap/hillshade_z11.pmtiles"

SOURCE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
# West, south, east, north. Same boxes as REGION_BBOX in src/store/mapStore.ts.
BOXES = {"eu": (-25.0, 27.0, 45.0, 72.0), "us": (-125.0, 24.0, -66.0, 50.0)}
MIN_ZOOM, MAX_ZOOM = 0, 11

# Shading parameters. Azimuth/altitude match MapLibre's hillshade defaults
# (light from the north-west, 45 degrees up). EXAGGERATION scales slopes the
# way `hillshade-exaggeration` did; SHADOW/HIGHLIGHT set how opaque the
# darkest shadow and brightest lit face get.
AZIMUTH_DEG = 315.0
ALTITUDE_DEG = 45.0
EXAGGERATION = 1.6
SHADOW_STRENGTH = 1.35
# Shadows only. Measured over 60 random tiles of both continents: shadows and
# highlights together average 18 KB a tile because the RGB channel flips
# between black and white along every ridge; shadows alone average 5 KB, and
# the relief reads the same over a light basemap. Set > 0 to bring the
# highlights back.
HIGHLIGHT_STRENGTH = 0.0
WEBP_QUALITY = 60
WEBP_ALPHA_QUALITY = 40
WORKERS = 32


# ----------------------------------------------------------------- tile math
def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_center_lat(y: int, z: int) -> float:
    n = 2**z
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / n))))


def metres_per_pixel(y: int, z: int) -> float:
    return 156543.03392 * math.cos(math.radians(tile_center_lat(y, z))) / 2**z


def all_tiles() -> list[tuple[int, int, int]]:
    seen: set[tuple[int, int, int]] = set()
    for z in range(MIN_ZOOM, MAX_ZOOM + 1):
        for w, s, e, n in BOXES.values():
            x0, y0 = lonlat_to_tile(w, n, z)
            x1, y1 = lonlat_to_tile(e, s, z)
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    seen.add((z, x, y))
    return sorted(seen)


def png_path(z: int, x: int, y: int) -> Path:
    return PNG_DIR / str(z) / str(x) / f"{y}.png"


def webp_path(z: int, x: int, y: int) -> Path:
    return WEBP_DIR / str(z) / str(x) / f"{y}.webp"


# ------------------------------------------------------------------ download
def fetch(z: int, x: int, y: int, retries: int = 4) -> bytes | None:
    url = SOURCE.format(z=z, x=x, y=y)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1.5 * (attempt + 1))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    print(f"FAILED {z}/{x}/{y}", file=sys.stderr)
    return None


def download_one(t: tuple[int, int, int]) -> int:
    z, x, y = t
    p = png_path(z, x, y)
    if p.exists():
        return 0
    data = fetch(z, x, y)
    if data is None:
        return 0
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(p)
    return len(data)


def cmd_download(bbox: tuple[float, float, float, float] | None = None) -> None:
    tiles = all_tiles()
    if bbox is not None:
        w, s, e, n = bbox
        keep = set()
        for z in range(MIN_ZOOM, MAX_ZOOM + 1):
            x0, y0 = lonlat_to_tile(w, n, z)
            x1, y1 = lonlat_to_tile(e, s, z)
            # one tile of margin so edge tiles get real neighbours
            keep.update(
                (z, x, y) for x in range(x0 - 1, x1 + 2) for y in range(y0 - 1, y1 + 2)
            )
        tiles = [t for t in tiles if t in keep]
    todo = [t for t in tiles if not png_path(*t).exists()]
    print(f"{len(tiles):,} tiles in coverage, {len(todo):,} to download", flush=True)
    done = 0
    total = 0
    started = time.time()
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for n in ex.map(download_one, todo):
            done += 1
            total += n
            if done % 2000 == 0:
                rate = done / (time.time() - started)
                print(
                    f"  {done:,}/{len(todo):,}  {total / 1e9:.2f} GB  {rate:.0f} tiles/s  "
                    f"eta {(len(todo) - done) / max(rate, 1e-6) / 60:.0f} min",
                    flush=True,
                )
    print(f"download done: {done:,} tiles, {total / 1e9:.2f} GB", flush=True)


# -------------------------------------------------------------------- render
def decode_terrarium(data: bytes) -> np.ndarray:
    a = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"), dtype=np.float32)
    return a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0


@functools.lru_cache(maxsize=8192)
def load_elevation(z: int, x: int, y: int) -> np.ndarray | None:
    """Cached: every tile is decoded once for itself and eight more times as a
    neighbour; callers only read from the returned array."""
    p = png_path(z, x, y)
    if not p.exists():
        return None
    return decode_terrarium(p.read_bytes())


def padded_elevation(z: int, x: int, y: int) -> np.ndarray | None:
    """258x258: the tile plus a one-pixel ring from its neighbours, so the
    gradient at the tile edge is real and the seams disappear. A missing
    neighbour (outside coverage, or the map edge) replicates the border."""
    centre = load_elevation(z, x, y)
    if centre is None:
        return None
    n = 2**z
    out = np.pad(centre, 1, mode="edge")  # fallback: replicate our own border
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            ny = y + dy
            if not 0 <= ny < n:
                continue
            neigh = load_elevation(z, (x + dx) % n, ny)
            if neigh is None:
                continue
            ys = slice(0, 1) if dy < 0 else (slice(257, 258) if dy > 0 else slice(1, 257))
            xs = slice(0, 1) if dx < 0 else (slice(257, 258) if dx > 0 else slice(1, 257))
            sy = slice(255, 256) if dy < 0 else (slice(0, 1) if dy > 0 else slice(0, 256))
            sx = slice(255, 256) if dx < 0 else (slice(0, 1) if dx > 0 else slice(0, 256))
            out[ys, xs] = neigh[sy, sx]
    return out


def shade(elev: np.ndarray, res_m: float) -> np.ndarray:
    """Horn hillshade on a padded array; returns the 256x256 RGBA overlay."""
    e = np.maximum(elev, 0.0)  # sea floor stays flat
    a, b, c = e[:-2, :-2], e[:-2, 1:-1], e[:-2, 2:]
    d, f = e[1:-1, :-2], e[1:-1, 2:]
    g, h, i = e[2:, :-2], e[2:, 1:-1], e[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8.0 * res_m)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8.0 * res_m)
    slope = np.arctan(EXAGGERATION * np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    alt = math.radians(ALTITUDE_DEG)
    az = math.radians(AZIMUTH_DEG)
    s = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - math.pi / 2 - aspect)
    delta = s - math.sin(alt)  # 0 on flat ground
    shadow = np.clip(-delta * SHADOW_STRENGTH, 0, 1)
    light = np.clip(delta * HIGHLIGHT_STRENGTH, 0, 1)
    rgba = np.zeros((256, 256, 4), dtype=np.uint8)
    lit = light > shadow
    rgba[..., :3] = np.where(lit[..., None], 255, 0)
    rgba[..., 3] = (np.where(lit, light, shadow) * 255).astype(np.uint8)
    return rgba


def render_one(t: tuple[int, int, int]) -> int:
    z, x, y = t
    out = webp_path(z, x, y)
    if out.exists():
        return 0
    elev = padded_elevation(z, x, y)
    if elev is None:
        return 0
    rgba = shade(elev, metres_per_pixel(y, z))
    out.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(
        buf, "WEBP", quality=WEBP_QUALITY, alpha_quality=WEBP_ALPHA_QUALITY, method=4
    )
    tmp = out.with_suffix(".tmp")
    tmp.write_bytes(buf.getvalue())
    tmp.replace(out)
    return buf.tell()


def cmd_render() -> None:
    tiles = [t for t in all_tiles() if png_path(*t).exists() and not webp_path(*t).exists()]
    print(f"{len(tiles):,} tiles to render", flush=True)
    done = total = 0
    started = time.time()
    with cf.ThreadPoolExecutor(max(4, (os.cpu_count() or 4) - 1)) as ex:
        for n in ex.map(render_one, tiles, chunksize=64):
            done += 1
            total += n
            if done % 5000 == 0:
                rate = done / (time.time() - started)
                print(
                    f"  {done:,}/{len(tiles):,}  {total / 1e6:.0f} MB  {rate:.0f} tiles/s  "
                    f"eta {(len(tiles) - done) / max(rate, 1e-6) / 60:.0f} min",
                    flush=True,
                )
    print(f"render done: {done:,} tiles, {total / 1e9:.2f} GB of WebP", flush=True)


# ---------------------------------------------------------------------- pack
def cmd_pack(out: Path = OUT_PMTILES, bbox: tuple[float, float, float, float] | None = None) -> None:
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer

    tiles = [t for t in all_tiles() if webp_path(*t).exists()]
    if bbox is not None:
        w, s, e, n = bbox
        keep = set()
        for z in range(MIN_ZOOM, MAX_ZOOM + 1):
            x0, y0 = lonlat_to_tile(w, n, z)
            x1, y1 = lonlat_to_tile(e, s, z)
            keep.update((z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1))
        tiles = [t for t in tiles if t in keep]
    tiles.sort(key=lambda t: zxy_to_tileid(*t))
    print(f"packing {len(tiles):,} tiles", flush=True)
    lons = [b[0] for b in BOXES.values()] + [b[2] for b in BOXES.values()]
    lats = [b[1] for b in BOXES.values()] + [b[3] for b in BOXES.values()]
    with open(out, "wb") as f:
        w = Writer(f)
        for t in tiles:
            w.write_tile(zxy_to_tileid(*t), webp_path(*t).read_bytes())
        header = {
            "tile_type": TileType.WEBP,
            "tile_compression": Compression.NONE,
            "min_zoom": MIN_ZOOM,
            "max_zoom": MAX_ZOOM,
            "min_lon_e7": int(min(lons) * 1e7),
            "min_lat_e7": int(min(lats) * 1e7),
            "max_lon_e7": int(max(lons) * 1e7),
            "max_lat_e7": int(max(lats) * 1e7),
            "center_zoom": 6,
            "center_lon_e7": int(10.0 * 1e7),
            "center_lat_e7": int(47.0 * 1e7),
        }
        metadata = {
            "name": "Funges hillshade",
            "description": "Pre-rendered hillshade (Horn, az 315, alt 45) from AWS Terrain Tiles (Terrarium). Grey+alpha WebP overlay.",
            "attribution": "Terrain: Mapzen / AWS Terrain Tiles (SRTM, GMTED, ETOPO1 and others)",
            "type": "overlay",
            "format": "webp",
        }
        w.finalize(header, metadata)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)", flush=True)


# -------------------------------------------------------------------- upload
def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def cmd_upload() -> None:
    import boto3

    # Same credentials the scoring pipeline uses (app_operation/.env.secret).
    load_dotenv(ROOT.parent / ".env.secret")

    def env(name: str) -> str:
        v = os.environ.get(name)
        if not v:
            sys.exit(f"missing env {name}")
        return v

    client = boto3.client(
        "s3",
        endpoint_url=env("R2_ENDPOINT_URL"),
        aws_access_key_id=env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=env("R2_SECRET_ACCESS_KEY"),
    )
    print(f"uploading {OUT_PMTILES.name} to {R2_KEY}", flush=True)
    client.upload_file(
        str(OUT_PMTILES),
        env("R2_BUCKET_NAME"),
        R2_KEY,
        ExtraArgs={"ContentType": "application/octet-stream"},
    )
    print("upload done", flush=True)


# -------------------------------------------------------------------- sample
def cmd_sample(z: int, x: int, y: int) -> None:
    """Render one tile from the live source and write a preview next to the
    cache: the shade over a flat land colour, and the raw overlay."""
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            download_one((z, x + dx, y + dy))
    elev = padded_elevation(z, x, y)
    assert elev is not None, "tile not available"
    rgba = shade(elev, metres_per_pixel(y, z))
    over = Image.fromarray(rgba, "RGBA")
    buf = io.BytesIO()
    over.save(buf, "WEBP", quality=WEBP_QUALITY, alpha_quality=WEBP_ALPHA_QUALITY, method=6)
    CACHE.mkdir(parents=True, exist_ok=True)
    land = Image.new("RGBA", (256, 256), (154, 162, 122, 255))
    land.alpha_composite(Image.open(io.BytesIO(buf.getvalue())).convert("RGBA"))
    land = land.resize((768, 768), Image.NEAREST)
    land.save(CACHE / f"sample_{z}_{x}_{y}.png")
    print(f"webp {buf.tell()} bytes; preview {CACHE / f'sample_{z}_{x}_{y}.png'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    dl = sub.add_parser("download")
    dl.add_argument("--bbox", type=float, nargs=4, metavar=("W", "S", "E", "N"), help="download only this box (local test)")
    sub.add_parser("render")
    pk = sub.add_parser("pack")
    pk.add_argument("--bbox", type=float, nargs=4, metavar=("W", "S", "E", "N"), help="pack only this box (local test)")
    pk.add_argument("--out", type=Path, default=OUT_PMTILES)
    sub.add_parser("upload")
    s = sub.add_parser("sample")
    s.add_argument("z", type=int)
    s.add_argument("x", type=int)
    s.add_argument("y", type=int)
    args = ap.parse_args()
    if args.cmd == "download":
        cmd_download(tuple(args.bbox) if args.bbox else None)
    elif args.cmd == "render":
        cmd_render()
    elif args.cmd == "pack":
        cmd_pack(args.out, tuple(args.bbox) if args.bbox else None)
    elif args.cmd == "upload":
        cmd_upload()
    else:
        cmd_sample(args.z, args.x, args.y)


if __name__ == "__main__":
    main()
