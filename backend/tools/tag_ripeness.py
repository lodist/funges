#!/usr/bin/env python3
"""Ripe or green: which fruiting sightings show ripe fruit (tools/fit_phenology.py's "ripe" stage).

iNaturalist's fruiting tag counts green fruit, and flower heads, too: where fruit hangs green for
weeks the learned season opened that early (elderberry, 45% of places at 4+ on 25 June). A general
CLIP model scores each fruiting sighting's first photo against a ripe and a green description of
the plant, zero-shot. Checked by eye on contact sheets of the most and least ripe of a pilot: right
for the dark berries below. Not for the nuts and pawpaw: their ripest-looking photos are last
year's empty husks, shells and seeds on winter ground, so they keep their months. BioCLIP, trained
for taxonomy, scored green July elderberries as ripe as September's.

    python -P -E backend/tools/tag_ripeness.py --out ../plant_training   # -> photos/, ripeness.parquet
"""
import argparse
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import requests

MODEL = "hf-hub:laion/CLIP-ViT-B-32-laion2B-s34B-b79K"
PROMPTS = {"elderberry": ("ripe black elderberries", "green unripe elderberries"),
           "sloes": ("ripe dark blue sloe berries", "green unripe sloe berries"),
           "blueberry": ("ripe blue blueberries", "green unripe blueberries")}
RIPE = 0.5                      # P(ripe) from which fit_phenology counts a sighting ripe


def photo_urls(ids: list, cache: Path) -> pd.Series:
    """Each sighting's first photo, small size (iNaturalist API, 200 per call), cached."""
    known = pd.read_parquet(cache) if cache.exists() else pd.DataFrame({"id": [], "url": []})
    todo = sorted(set(ids) - set(known["id"]))
    rows = []
    for i in range(0, len(todo), 200):
        r = requests.get("https://api.inaturalist.org/v1/observations",
                         params={"id": ",".join(map(str, todo[i:i + 200])), "per_page": 200}, timeout=60)
        r.raise_for_status()
        rows += [{"id": o["id"], "url": o["photos"][0]["url"].replace("square", "small")}
                 for o in r.json()["results"] if o.get("photos")]
        time.sleep(1.0)
    if rows:
        known = pd.concat([known, pd.DataFrame(rows)], ignore_index=True)
        known.to_parquet(cache, index=False)
    return known.set_index("id")["url"]


def download(urls: pd.Series, folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)

    def get(item):
        path = folder / f"{item[0]}.jpg"
        if path.exists():
            return
        try:
            r = requests.get(item[1], timeout=30)
            if r.ok and r.headers.get("content-type", "").startswith("image/"):
                path.write_bytes(r.content)
        except requests.RequestException:
            pass

    with ThreadPoolExecutor(16) as pool:
        list(pool.map(get, urls.items()))


def score(paths: list, prompts: tuple, model, preprocess, tokenizer) -> np.ndarray:
    """P(ripe) per photo: softmax over the ripe and green descriptions, CLIP's own scale (x100)."""
    import torch
    from PIL import Image
    with torch.no_grad():
        text = model.encode_text(tokenizer([f"a photo of {p}." for p in prompts]))
        text = text / text.norm(dim=-1, keepdim=True)
        out = []
        for i in range(0, len(paths), 64):
            batch = []
            for path in paths[i:i + 64]:
                try:
                    batch.append(preprocess(Image.open(path).convert("RGB")))
                except OSError:
                    batch.append(None)
            ok = [b for b in batch if b is not None]
            p = np.full(len(batch), np.nan)
            if ok:
                image = model.encode_image(torch.stack(ok))
                image = image / image.norm(dim=-1, keepdim=True)
                p[[k for k, b in enumerate(batch) if b is not None]] = (100 * image @ text.T).softmax(dim=-1)[:, 0].numpy()
            out.append(p)
    return np.concatenate(out) if out else np.array([])


def main() -> None:
    import open_clip
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="the plant training folder (inat/)")
    args = parser.parse_args()
    out = Path(args.out)
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL)
    tokenizer = open_clip.get_tokenizer(MODEL)
    model.eval()
    frames = []
    for plant, prompts in PROMPTS.items():
        t = pd.read_parquet(out / "inat" / f"{plant}.parquet")
        ids = t.loc[t["fruiting"], "id"].drop_duplicates().tolist()
        urls = photo_urls(ids, out / "photo_urls.parquet").reindex(ids).dropna()
        download(urls, out / "photos" / plant)
        paths = [out / "photos" / plant / f"{i}.jpg" for i in urls.index]
        have = [p.exists() for p in paths]
        found = [p for p, h in zip(paths, have) if h]
        frames.append(pd.DataFrame({"id": [int(p.stem) for p in found], "plant": plant,
                                    "p_ripe": score(found, prompts, model, preprocess, tokenizer)}))
        print(f"{plant}: {len(ids):,} fruiting, {len(found):,} photos, "
              f"{(frames[-1]['p_ripe'] >= RIPE).mean():.0%} ripe", flush=True)
    pd.concat(frames, ignore_index=True).to_parquet(out / "ripeness.parquet", index=False)


if __name__ == "__main__":
    main()
