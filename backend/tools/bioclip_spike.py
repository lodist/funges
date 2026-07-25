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
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
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


def top_k_accuracy(preds, k):
    """Share of CATALOG photos whose true label is in the top k. Toxic excluded."""
    catalog = [p for p in preds if p["truth_kind"] == "catalog"]
    if not catalog:
        return 0.0
    hits = sum(1 for p in catalog if p["truth"] in p["ranked"][:k])
    return hits / len(catalog)


def false_edible_rate(preds, catalog_names, k):
    """THE GATE. Share of TOXIC photos with an edible label in the top k.

    This is the number that can kill the feature: it is how often the app
    would suggest something edible while looking at a poisonous specimen.
    """
    toxic = [p for p in preds if p["truth_kind"] == "toxic"]
    if not toxic:
        return 0.0
    bad = sum(
        1 for p in toxic if any(r in catalog_names for r in p["ranked"][:k])
    )
    return bad / len(toxic)


def worst_confusions(preds, catalog_names, limit=10):
    """Ranked toxic->edible top-1 confusions. An aggregate is not actionable.

    Sorted count-first, then rate. This is a deliberate choice, not a default:
    count ranks by total incidents in the test set, which tracks how often a
    confusion would actually reach a user. Rate-first would instead surface
    systematic blind spots (a species wrong 80% of the time) above merely
    common ones. Both are defensible and both are printed per row as
    `count`/`n`/`rate`, so ordering only decides what a reader sees first.
    """
    totals, pairs = {}, {}
    for p in preds:
        if p["truth_kind"] != "toxic":
            continue
        totals[p["truth"]] = totals.get(p["truth"], 0) + 1
        top = p["ranked"][0] if p["ranked"] else None
        if top in catalog_names:
            pairs[(p["truth"], top)] = pairs.get((p["truth"], top), 0) + 1

    rows = [
        {
            "toxic": toxic,
            "predicted": edible,
            "count": count,
            "n": totals[toxic],
            "rate": count / totals[toxic],
        }
        for (toxic, edible), count in pairs.items()
    ]
    rows.sort(key=lambda r: (-r["count"], -r["rate"], r["toxic"]))
    return rows[:limit]


def threshold_sweep(preds, catalog_names, cutoffs, k):
    """Per cutoff: false-edible rate, share of photos answered, and toxic n.

    Decides whether the feature can have an honest "I'm not sure" state and
    what that costs in coverage.

    `toxic_n` is not decoration. Raising the cutoff shrinks the toxic
    sub-sample, and false_edible_rate returns 0.0 for an EMPTY sample — so a
    cutoff that filters out every toxic photo reports a perfect 0% gate while
    having measured nothing at all. Always read false_edible together with
    toxic_n, or the most attractive row in the table may be the emptiest one.

    `top1` is deliberately pinned to k=1: it is the headline rank-1 number,
    independent of the gate's k. It is not a bug — do not "fix" it to use k.

    `answered` is a share (0..1) of ALL preds, not a count.
    """
    rows = []
    for cutoff in cutoffs:
        kept = [p for p in preds if p["confidence"] >= cutoff]
        rows.append(
            {
                "cutoff": cutoff,
                "answered": len(kept) / len(preds) if preds else 0.0,
                "toxic_n": sum(1 for p in kept if p["truth_kind"] == "toxic"),
                "false_edible": false_edible_rate(kept, catalog_names, k),
                "top1": top_k_accuracy(kept, k=1),
            }
        )
    return rows


RANKS = ["kingdom", "phylum", "class", "order", "family", "genus", "species"]


def taxonomic_prompt(lineage):
    """Build BioCLIP's taxonomic prompt from a rank->name mapping.

    BioCLIP is trained on full lineage strings, so bare species names
    underperform. Missing ranks are skipped. The genus is not repeated when a
    binomial species name already contains it.

    Raises on a lineage with no standard rank at all. iNaturalist also uses
    ranks outside the seven here ("complex", "section", "subgenus", ...), and a
    lineage holding only those would otherwise render as "a photo of ." — a
    prompt that embeds without error and silently corrupts that label's entire
    column in the report. In a spike whose premise is that prompt content
    matters, that must fail loudly rather than produce a plausible number.
    """
    parts = []
    for rank in RANKS:
        name = lineage.get(rank)
        if not name:
            continue
        # parts[-1] is the genus here ONLY because RANKS puts genus immediately
        # before species. Insert a rank between them (iNat has "subgenus") and
        # this guard silently stops firing — compare lineage.get("genus") then.
        if rank == "species" and parts and name.startswith(parts[-1] + " "):
            parts[-1] = name          # "Amanita" + "Amanita phalloides"
        else:
            parts.append(name)
    if not parts:
        raise ValueError(f"lineage has no standard rank, cannot prompt: {lineage!r}")
    return "a photo of " + " ".join(parts) + "."


_LAST_CALL = [0.0]


def _get_json(path, params, retries=6):
    """GET <INAT_API><path>?<params> as JSON, throttled to ~1 req/sec.

    iNaturalist asks for <=60 req/min and a real User-Agent. Backoff mirrors
    build_season_curves.py, including honouring Retry-After on 429.
    """
    url = f"{INAT_API}{path}?" + urllib.parse.urlencode(params, doseq=True)
    for attempt in range(retries):
        wait = 1.0 - (time.time() - _LAST_CALL[0])
        if wait > 0:
            time.sleep(wait)
        _LAST_CALL[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if attempt == retries - 1:
                raise
            if e.code == 429:
                retry_after = e.headers.get("Retry-After")
                delay = (
                    float(retry_after)
                    if (retry_after and retry_after.isdigit())
                    else 2.0 * (attempt + 1)
                )
                time.sleep(delay)
            else:
                time.sleep(1.5 * (attempt + 1))
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"unreachable: {url}")


def resolve_taxon(name, rank):
    """Scientific name -> {"id", "lineage": {rank: name}}.

    Two calls: /taxa?q= to find the id, then /taxa/{id} which reliably returns
    the full `ancestors` array used to build the BioCLIP prompt.
    """
    hits = _get_json("/taxa", {"q": name, "rank": rank, "per_page": 5})
    exact = [r for r in hits.get("results", []) if r.get("name") == name]
    if not exact:
        raise LookupError(f"iNat has no {rank} named {name!r}")
    taxon_id = exact[0]["id"]

    detail = _get_json(f"/taxa/{taxon_id}", {})["results"][0]
    lineage = {}
    for anc in detail.get("ancestors", []) + [detail]:
        if anc.get("rank") in RANKS:
            lineage[anc["rank"]] = anc["name"]
    return {"id": taxon_id, "lineage": lineage}


def fetch_observations(taxon_id, since, needed):
    """Research-grade observations with photos, newest first.

    Returns [{"observation_id", "photo_urls"}]. `url` from the API is a 75px
    square thumbnail; swapping the filename for `medium` gives ~500px.
    """
    out, page = [], 1
    while sum(len(o["photo_urls"]) for o in out) < needed and page <= 10:
        data = _get_json(
            "/observations",
            {
                "taxon_id": taxon_id,
                "quality_grade": "research",
                "photos": "true",
                "d1": since,
                "per_page": 200,
                "page": page,
                "order_by": "observed_on",
                "order": "desc",
            },
        )
        results = data.get("results", [])
        if not results:
            break
        for obs in results:
            urls = [
                p["url"].replace("square", "medium")
                for p in obs.get("photos", [])
                if p.get("url")
            ]
            if urls:
                out.append({"observation_id": obs["id"], "photo_urls": urls})
        page += 1
    return out


def download(url, dest):
    """Download url to dest unless already present. Returns True on success."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        if not data:
            return False
        dest.write_bytes(data)
        return True
    except Exception:
        return False


def stage_fetch(since, only=None):
    """iNaturalist -> spike_cache/images/ + manifest.json (resume-safe).

    NOTE: manifest.json is rewritten from scratch, so a --only run leaves a
    manifest covering only those labels. Re-run without --only before
    evaluating; downloads are cached, so that is cheap.
    """
    images = CACHE / "images"
    images.mkdir(parents=True, exist_ok=True)

    labels = all_labels()
    if only:
        # destructure rather than index — a rank/kind swap on a 3-tuple of bare
        # strings fails silently, and `kind` is what marks a photo toxic
        labels = [(n, r, k) for n, r, k in labels if n in only]

    lineages_path = CACHE / "lineages.json"
    lineages = (
        json.loads(lineages_path.read_text()) if lineages_path.exists() else {}
    )

    manifest, dropped = [], 0
    for name, rank, kind in labels:
        try:
            taxon = resolve_taxon(name, rank)
        except LookupError as e:
            print(f"  SKIP {name}: {e}")
            continue

        # taxonomic_prompt raises on a lineage with no standard rank, but it
        # only sees the dict — not which of the 53 labels produced it. Fail
        # with the label attached or a crash 30 labels in is unplaceable.
        try:
            taxonomic_prompt(taxon["lineage"])
        except ValueError as e:
            raise ValueError(f"{name}: {e}") from e

        obs = fetch_observations(taxon["id"], since, GALLERY_N + TEST_N)
        gallery, test = split_by_observation(obs, GALLERY_N, TEST_N)
        print(f"  {name}: {len(obs)} obs -> {len(gallery)} gallery / {len(test)} test")

        jobs = [("gallery", p) for p in gallery] + [("test", p) for p in test]
        with ThreadPoolExecutor(max_workers=8) as ex:
            futures = {}
            for split, photo in jobs:
                fname = f"{name.replace(' ', '_')}_{photo['observation_id']}_{Path(urllib.parse.urlparse(photo['url']).path).name}"
                dest = images / fname
                futures[ex.submit(download, photo["url"], dest)] = (
                    split,
                    photo,
                    dest,
                )
            for fut in as_completed(futures):
                split, photo, dest = futures[fut]
                if fut.result():
                    manifest.append(
                        {
                            "file": dest.name,
                            "label": name,
                            "kind": kind,
                            "split": split,
                            "observation_id": photo["observation_id"],
                        }
                    )
                else:
                    dropped += 1

        # written per label, not once at the end, so an interrupted 45-minute
        # run does not lose the lineages it already resolved
        lineages[name] = taxon["lineage"]
        lineages_path.write_text(json.dumps(lineages, indent=2), encoding="utf-8")

    (CACHE / "manifest.json").write_text(
        json.dumps({"photos": manifest, "dropped": dropped}, indent=2),
        encoding="utf-8",
    )
    print(f"\nfetched {len(manifest)} photos, dropped {dropped}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--stage",
        choices=["fetch", "embed", "evaluate", "all"],
        default="all",
    )
    ap.add_argument("--since", default=SINCE)
    ap.add_argument("--list-labels", action="store_true")
    ap.add_argument(
        "--only",
        nargs="*",
        help="restrict to these scientific names (for smoke runs)",
    )
    args = ap.parse_args()

    if args.list_labels:
        labels = all_labels()
        for name, rank, kind in labels:
            print(f"{kind:8s} {rank:8s} {name}")
        n_cat = sum(1 for _, _, k in labels if k == "catalog")
        n_tox = sum(1 for _, _, k in labels if k == "toxic")
        print(f"\n{n_cat} catalog + {n_tox} toxic = {len(labels)} labels")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    if args.stage in ("fetch", "all"):
        print("== fetch ==")
        stage_fetch(args.since, only=args.only)
    if args.stage in ("embed", "all"):
        raise SystemExit("embed not implemented yet")


if __name__ == "__main__":
    main()
