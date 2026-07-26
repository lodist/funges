#!/usr/bin/env python3
"""Measure the false-edible gate at a WIDE label vocabulary.

BioCLIP is open-vocabulary: it scores whatever text prompts it is given. The
spike measured the gate over 53 labels, but the feature should be able to name
species outside the app's own catalog ("tier 2"). More labels means more
plausible-but-wrong neighbours, so the 53-label gate cannot be assumed to
transfer — this script measures it.

No new photos are fetched. The gate is computed over the SAME 660 toxic test
photos already in spike_cache/; adding labels only changes what those photos
compete against. So this needs lineages + text embeddings for the distractor
species, nothing more.

    python backend/tools/bioclip_wide_vocab.py --stage taxa      # iNat -> wide_vocab.json
    python backend/tools/bioclip_wide_vocab.py --stage evaluate   # re-run the gate

Reuses bioclip_spike's prompt builder and metrics so the wide-vocabulary numbers
are produced by exactly the code that produced the 53-label ones.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bioclip_spike import (  # noqa: E402
    CACHE,
    CATALOG_NAMES,
    MODEL_HUB_ID,
    RANKS,
    TOXIC_NAMES,
    _get_json,
    _predictions,
    false_edible_rate,
    load_model,
    taxonomic_prompt,
    threshold_sweep,
    top_k_accuracy,
    worst_confusions,
)

WIDE_VOCAB = CACHE / "wide_vocab.json"
WIDE_COUNTS = CACHE / "wide_vocab_counts.json"

# iNaturalist kingdom taxon ids. Foraging confusions live in fungi and plants;
# nothing else is a plausible neighbour for this catalog.
KINGDOMS = {"Fungi": 47170, "Plantae": 47126}

# iNaturalist refuses per_page above this.
PAGE_CAP = 500

# Same bounding boxes the scoring pipeline uses (backend/tools/build_season_curves.py),
# so the distractor set is regionally plausible rather than globally random.
REGIONS = {
    "NE": {"lat": (49.0, 71.5), "lon": (-25.0, 32.0)},
    "SE": {"lat": (34.0, 55.5), "lon": (12.0, 42.5)},
    "USE": {"lat": (24.0, 37.5), "lon": (-106.5, -75.0)},
    "USW": {"lat": (33.0, 49.5), "lon": (-125.5, -81.5)},
}


def fetch_regional_species(per_region):
    """Most-observed research-grade species per region and kingdom.

    Returns {taxon_id: scientific_name}. Uses /observations/species_counts, which
    returns species ranked by observation count — i.e. what a user is actually
    likely to be photographing, not an arbitrary slice of the taxonomy.
    """
    found = {}
    # taxon_id -> highest observation count seen in any region. Max rather than
    # sum: a species common in one region should not be ranked down for being
    # absent from another.
    counts = {}
    for region, box in REGIONS.items():
        for kingdom, taxon_id in KINGDOMS.items():
            new = 0
            # iNat caps per_page at 500, so anything larger has to be paged.
            # Ranking is by observation count, so page 1 is the most-photographed
            # species and later pages tail off into rarities — which is exactly
            # the order we want to spend label budget in.
            remaining = per_region
            page = 1
            while remaining > 0:
                size = min(PAGE_CAP, remaining)
                data = _get_json(
                    "/observations/species_counts",
                    {
                        "taxon_id": taxon_id,
                        "quality_grade": "research",
                        "swlat": box["lat"][0],
                        "nelat": box["lat"][1],
                        "swlng": box["lon"][0],
                        "nelng": box["lon"][1],
                        "per_page": size,
                        "page": page,
                    },
                )
                results = data.get("results", [])
                for row in results:
                    taxon = row.get("taxon") or {}
                    if taxon.get("rank") != "species":
                        continue
                    name = taxon.get("name")
                    tid = taxon.get("id")
                    if not name or not tid:
                        continue
                    seen = row.get("count") or 0
                    if seen > counts.get(name, 0):
                        counts[name] = seen
                    if tid in found:
                        continue
                    found[tid] = name
                    new += 1
                # Short page means the region is exhausted; asking for more would
                # just re-request the same tail.
                if len(results) < size:
                    break
                remaining -= size
                page += 1
            print(f"  {region}/{kingdom}: +{new} species (total {len(found)})")
    return found, counts


def fetch_lineages(taxon_ids, batch=30):
    """Batch-fetch full ancestor chains. /taxa accepts comma-separated ids."""
    lineages = {}
    ids = list(taxon_ids)
    for start in range(0, len(ids), batch):
        chunk = ids[start : start + batch]
        data = _get_json("/taxa/" + ",".join(str(i) for i in chunk), {})
        for detail in data.get("results", []):
            lineage = {}
            for anc in detail.get("ancestors", []) + [detail]:
                if anc.get("rank") in RANKS:
                    lineage[anc["rank"]] = anc["name"]
            name = detail.get("name")
            # taxonomic_prompt raises on a lineage with no standard rank; skip
            # rather than abort a 40-call fetch over one odd taxon.
            if not name or not lineage:
                continue
            try:
                taxonomic_prompt(lineage)
            except ValueError:
                continue
            lineages[name] = lineage
        print(f"  lineages {len(lineages)}/{len(ids)}")
    return lineages


def stage_taxa(per_region):
    """iNat -> spike_cache/wide_vocab.json (tier-2 distractor labels)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    species, counts = fetch_regional_species(per_region)
    print(f"\n{len(species)} unique species-rank taxa before exclusions")

    # A tier-1 name must never also be a tier-2 name — the app's matcher asserts
    # this too. Excluding here keeps the two vocabularies disjoint at the source.
    tier1 = CATALOG_NAMES | TOXIC_NAMES
    species = {k: v for k, v in species.items() if v not in tier1}
    print(f"{len(species)} after removing the {len(tier1)} tier-1 names")

    lineages = fetch_lineages(species.keys())
    WIDE_VOCAB.write_text(json.dumps(lineages, indent=2), encoding="utf-8")
    print(f"\nwrote {len(lineages)} tier-2 labels to {WIDE_VOCAB}")

    # Ranking data for the tier-2 cap in bioclip_export.py. Separate file so the
    # vocabulary itself stays a plain name -> lineage map.
    kept = {n: counts.get(n, 0) for n in lineages}
    WIDE_COUNTS.write_text(json.dumps(kept, indent=2), encoding="utf-8")
    top = sorted(kept.items(), key=lambda kv: -kv[1])[:5]
    print(f"wrote observation counts to {WIDE_COUNTS}")
    print(f"  most observed: {', '.join(f'{n} ({c})' for n, c in top)}")


def stage_evaluate():
    """Re-run the gate with tier-1 + tier-2 labels over the same test photos."""
    import numpy as np

    if not WIDE_VOCAB.exists():
        raise SystemExit("no wide_vocab.json — run --stage taxa first")

    vectors = np.load(CACHE / "embeddings.npy")
    tier1_text = np.load(CACHE / "text_embeddings.npy")
    order = json.loads((CACHE / "embed_order.json").read_text())
    photos, tier1_labels = order["photos"], order["text_labels"]

    if len(photos) != len(vectors):
        raise SystemExit("embed_order/embeddings mismatch — re-run --stage embed")

    wide = json.loads(WIDE_VOCAB.read_text())
    tier2_labels = sorted(wide)
    overlap = set(tier2_labels) & set(tier1_labels)
    if overlap:
        raise SystemExit(f"tier-1/tier-2 overlap: {sorted(overlap)[:5]}")

    print(f"embedding {len(tier2_labels)} tier-2 text prompts…")
    model, _preprocess, tokenizer, torch = load_model()
    prompts = [taxonomic_prompt(wide[n]) for n in tier2_labels]
    chunks = []
    for start in range(0, len(prompts), 256):
        with torch.no_grad():
            feats = model.encode_text(tokenizer(prompts[start : start + 256]))
            feats /= feats.norm(dim=-1, keepdim=True)
        chunks.append(feats.cpu().numpy())
    tier2_text = np.concatenate(chunks)

    test_idx = [i for i, p in enumerate(photos) if p["split"] == "test"]
    rows = [photos[i] for i in test_idx]
    test_vectors = vectors[test_idx]

    print(f"\n{'vocabulary':<34} {'labels':>7} {'FE@1':>7} {'FE@3':>7} {'top-1':>7}")
    print("-" * 68)
    results = {}
    for name, labels, text in (
        ("tier 1 only (the measured gate)", tier1_labels, tier1_text),
        (
            "tier 1 + tier 2 (wide)",
            tier1_labels + tier2_labels,
            np.concatenate([tier1_text, tier2_text]),
        ),
    ):
        preds = _predictions(test_vectors @ text.T, labels, rows)
        fe1 = false_edible_rate(preds, CATALOG_NAMES, k=1)
        fe3 = false_edible_rate(preds, CATALOG_NAMES, k=3)
        top1 = top_k_accuracy(preds, k=1)
        results[name] = {
            "labels": len(labels),
            "false_edible_1": fe1,
            "false_edible_3": fe3,
            "top1": top1,
            "confusions": worst_confusions(preds, CATALOG_NAMES, limit=5),
            "sweep": threshold_sweep(
                preds, CATALOG_NAMES, cutoffs=[0.0, 0.7], k=1
            ),
        }
        print(f"{name:<34} {len(labels):>7} {fe1:>6.1%} {fe3:>6.1%} {top1:>6.1%}")

    wide_res = results["tier 1 + tier 2 (wide)"]
    narrow = results["tier 1 only (the measured gate)"]
    print(
        f"\ngate change: {narrow['false_edible_1']:.1%} -> "
        f"{wide_res['false_edible_1']:.1%} "
        f"({wide_res['false_edible_1'] - narrow['false_edible_1']:+.1%})"
    )
    print(
        f"catalog top-1 change: {narrow['top1']:.1%} -> {wide_res['top1']:.1%} "
        f"({wide_res['top1'] - narrow['top1']:+.1%})"
    )
    print("\nworst toxic->edible confusions at the wide vocabulary:")
    for c in wide_res["confusions"]:
        print(f"  {c['toxic']:<28} -> {c['predicted']:<26} {c['rate']:.0%}")

    out = CACHE / "wide_vocab_report.json"
    out.write_text(json.dumps({"model": MODEL_HUB_ID, **results}, indent=2))
    print(f"\nwrote {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--stage", choices=["taxa", "evaluate"], required=True)
    ap.add_argument(
        "--per-region",
        type=int,
        default=200,
        help="species to request per region+kingdom (default 200)",
    )
    args = ap.parse_args()

    if args.stage == "taxa":
        stage_taxa(args.per_region)
    else:
        stage_evaluate()


if __name__ == "__main__":
    main()
