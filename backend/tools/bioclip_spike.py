#!/usr/bin/env python3
"""BioCLIP 2 accuracy spike — measure false-edible rate on toxic look-alikes.

Throwaway evaluation. See docs/superpowers/specs/2026-07-25-bioclip2-accuracy-spike-design.md
Delete this file if the spike says no.

Stages (disk-cached, run independently):
    --stage fetch      iNaturalist -> spike_cache/images/ + manifest.json
    --stage embed      images -> spike_cache/embeddings.npy
    --stage evaluate    embeddings -> report (stdout markdown + report.json)
"""
import argparse
import json
from pathlib import Path

# --- catalog labels: 31 unique scientific names from src/data/species.ts ---
# 33 entries collapse to 32 unique names (elderberry + elderflower are both
# Sambucus nigra); Tuber melanosporum is dropped (subterranean, no field photos).
CATALOG = [
    ("Cantharellus cibarius", "species"),
    ("Boletus", "genus"),               # catalog says "Boletus spp."
    ("Morchella", "genus"),             # catalog says "Morchella spp."
    ("Craterellus cornucopioides", "species"),
    ("Laetiporus sulphureus", "species"),
    ("Pleurotus ostreatus", "species"),
    ("Lentinula edodes", "species"),    # cultivated; expected below MIN_TEST
    ("Macrolepiota procera", "species"),
    ("Calocybe gambosa", "species"),
    ("Rubus fruticosus", "species"),
    ("Rubus idaeus", "species"),
    ("Sambucus nigra", "species"),      # both elderberry and elderflower
    ("Vaccinium myrtillus", "species"),
    ("Vaccinium vitis-idaea", "species"),
    ("Fragaria vesca", "species"),
    ("Urtica dioica", "species"),
    ("Taraxacum officinale", "species"),
    ("Corylus avellana", "species"),
    ("Allium ursinum", "species"),
    ("Mentha arvensis", "species"),
    ("Stellaria media", "species"),
    ("Plantago major", "species"),
    ("Juglans regia", "species"),
    ("Castanea sativa", "species"),
    ("Bellis perennis", "species"),
    ("Viola odorata", "species"),
    ("Amaranthus retroflexus", "species"),
    ("Cynara cardunculus", "species"),
    ("Asparagus acutifolius", "species"),
    ("Peucedanum ostruthium", "species"),
    ("Rumex acetosa", "species"),
]

# NOTE: CATALOG must contain exactly 31 entries — every unique scientificName in
# src/data/species.ts except Tuber melanosporum. Verify with:
#   grep -E "^    scientificName:" src/data/species.ts | sed "s/.*: '//;s/',$//" | sort -u

# --- toxic look-alikes: 22 labels. Mandatory: the catalog is edible-only, so
# without these the model cannot output "deadly" for any photo. ---
TOXIC = [
    ("Omphalotus olearius", "species"),        # -> Cantharellus, Pleurotus
    ("Hygrophoropsis aurantiaca", "species"),  # -> Cantharellus
    ("Chlorophyllum molybdites", "species"),   # -> Macrolepiota
    ("Lepiota brunneoincarnata", "species"),   # -> Macrolepiota
    ("Inocybe erubescens", "species"),         # -> Calocybe gambosa
    ("Entoloma sinuatum", "species"),          # -> Calocybe gambosa
    ("Gyromitra esculenta", "species"),        # -> Morchella
    ("Verpa bohemica", "species"),             # -> Morchella
    ("Rubroboletus satanas", "species"),       # -> Boletus
    ("Tylopilus felleus", "species"),          # -> Boletus
    ("Amanita phalloides", "species"),
    ("Amanita virosa", "species"),
    ("Amanita muscaria", "species"),
    ("Galerina marginata", "species"),
    ("Cortinarius rubellus", "species"),
    ("Colchicum autumnale", "species"),        # -> Allium ursinum (deadly)
    ("Convallaria majalis", "species"),        # -> Allium ursinum (deadly)
    ("Arum maculatum", "species"),             # -> Allium ursinum
    ("Conium maculatum", "species"),           # -> Peucedanum ostruthium
    ("Aethusa cynapium", "species"),           # -> Peucedanum ostruthium
    ("Atropa belladonna", "species"),          # -> Vaccinium
    ("Sambucus ebulus", "species"),            # -> Sambucus nigra
]

CATALOG_NAMES = {name for name, _ in CATALOG}
TOXIC_NAMES = {name for name, _ in TOXIC}

INAT_API = "https://api.inaturalist.org/v1"
USER_AGENT = "funges-bioclip-spike/1.0 (+https://fung.es)"
MODEL_HUB_ID = "hf-hub:imageomics/bioclip-2"

SINCE = "2026-01-01"   # recency filter, reduces (cannot eliminate) train overlap
GALLERY_N = 25
TEST_N = 30
MIN_TEST = 15          # below this a label is "insufficient data"

CACHE = Path(__file__).resolve().parents[2] / "spike_cache"


def all_labels():
    """[(scientific_name, rank, kind)] for every label in the evaluation."""
    return (
        [(n, r, "catalog") for n, r in CATALOG]
        + [(n, r, "toxic") for n, r in TOXIC]
    )


def split_by_observation(observations, gallery_n, test_n):
    """Split photos into (gallery, test) with NO observation in both.

    observations: [{"observation_id": int, "photo_urls": [str, ...]}]
    Returns two lists of {"observation_id", "url"} dicts.

    Splitting on observation id (not photo id) is mandatory: one observation
    holds several near-identical photos of one specimen, so a photo-level split
    would put duplicates in both sets and inflate the gallery method.

    Observations are dealt alternately to test and gallery, test getting the
    first deal, each capped at its own requested count; once one set reaches
    its count, all further observations go to the other until it too is full.
    This keeps both sets non-empty when data is thin (a strict "fill test to
    completion first" pass would starve gallery to zero), while test still
    wins ties when supply falls short of both quotas combined. Deterministic:
    observations are processed in sorted id order.

    A bucket that fills mid-observation keeps only enough photos to reach its
    cap; that observation's remaining photos are dropped, landing in neither
    list. So photos-used < photos-fetched whenever a cap is not a multiple of
    an observation's photo count.
    """
    ordered = sorted(observations, key=lambda o: o["observation_id"])

    test, gallery = [], []
    for i, obs in enumerate(ordered):
        if len(test) >= test_n and len(gallery) >= gallery_n:
            break
        photos = [
            {"observation_id": obs["observation_id"], "url": u}
            for u in obs["photo_urls"]
        ]
        buckets = [(test, test_n), (gallery, gallery_n)]
        if i % 2:
            buckets.reverse()
        for bucket, cap in buckets:
            if len(bucket) < cap:
                bucket.extend(photos[: cap - len(bucket)])
                break

    return gallery, test


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--stage",
        choices=["fetch", "embed", "evaluate", "all"],
        default="all",
    )
    ap.add_argument("--since", default=SINCE)
    ap.add_argument("--list-labels", action="store_true")
    args = ap.parse_args()

    if args.list_labels:
        labels = all_labels()
        for name, rank, kind in labels:
            print(f"{kind:8s} {rank:8s} {name}")
        n_cat = sum(1 for _, _, k in labels if k == "catalog")
        n_tox = sum(1 for _, _, k in labels if k == "toxic")
        print(f"\n{n_cat} catalog + {n_tox} toxic = {len(labels)} labels")
        return

    raise SystemExit("stages not implemented yet")


if __name__ == "__main__":
    main()
