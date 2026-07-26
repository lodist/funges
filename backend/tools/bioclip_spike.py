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

# --- catalog labels: 32 unique scientific names from src/data/species.ts ---
# 33 entries collapse to 32 unique names (elderberry + elderflower are both
# Sambucus nigra).
#
# Tuber melanosporum was originally dropped as subterranean — "every photo is
# harvested truffles on a table". That reasoning was backwards: a dug-up truffle
# on a table is exactly what someone photographs, and exactly when telling it
# from a poisonous Scleroderma matters. Scleroderma is promoted to TOXIC below,
# because adding an edible truffle without flagging its false twin would create
# a path from a poisonous find to an edible-looking row.
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
    ("Tuber melanosporum", "species"),  # dug-up specimen, not in situ
]

# NOTE: CATALOG must contain exactly 32 entries — every unique scientificName in
# src/data/species.ts except Tuber melanosporum. Verify with:
#   grep -E "^    scientificName:" src/data/species.ts | sed "s/.*: '//;s/',$//" | sort -u

# --- toxic look-alikes: 22 labels. Mandatory: the catalog is edible-only, so
# without these the model cannot output "deadly" for any photo. ---
TOXIC = [
    ("Omphalotus olearius", "species"),        # -> Cantharellus, Pleurotus
    ("Hygrophoropsis aurantiaca", "species"),  # -> Cantharellus
    ("Chlorophyllum molybdites", "species"),   # -> Macrolepiota
    ("Lepiota brunneoincarnata", "species"),   # -> Macrolepiota
    ("Inosperma erubescens", "species"),       # -> Calocybe gambosa; iNat moved it out of Inocybe
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
    ("Atropa bella-donna", "species"),         # -> Vaccinium; iNat spells it hyphenated
    ("Sambucus ebulus", "species"),            # -> Sambucus nigra
    # --- promoted from tier 2, where they showed as "no safety information" ---
    # All 13 were already in the vocabulary, so this changes their KIND only and
    # adds no rows to the text matrix. Two of them appeared in a real result set
    # during testing, unflagged: Taxus baccata and Omphalotus illudens.
    ("Scleroderma citrinum", "species"),       # -> Tuber (the false truffle)
    ("Scleroderma polyrhizum", "species"),     # -> Tuber
    ("Taxus baccata", "species"),              # lethal; yew arils
    ("Paxillus involutus", "species"),         # lethal; delayed immune haemolysis
    ("Digitalis purpurea", "species"),         # lethal; -> comfrey/borage leaves
    ("Amanita pantherina", "species"),
    ("Omphalotus illudens", "species"),        # O. olearius was already flagged
    ("Omphalotus olivascens", "species"),
    ("Omphalotus subilludens", "species"),
    ("Agaricus xanthodermus", "species"),      # -> field mushroom
    ("Hypholoma fasciculare", "species"),      # very common, clustered on wood
    ("Daphne mezereum", "species"),            # -> red berries
    ("Paris quadrifolia", "species"),          # -> Vaccinium myrtillus
]


# --- cultivated and culinary species, shipped as TIER 2 ---
# Named, with no edibility claim. Present because the model is a closed set and
# will otherwise force these onto their nearest neighbour - which for parsley and
# champignon is a species we flag as toxic. See the comment above CULTIVATED in
# the module docstring of bioclip_export.py --stage text-matrix.
CULTIVATED = [
    # Edible counterparts to toxics we flag. These four are the safety-relevant
    # ones: without them, an everyday find has only a toxic nearest neighbour.
    ("Agaricus bisporus", "species"),      # champignon, cremini, portobello
    ("Agaricus campestris", "species"),    # field mushroom -> A. xanthodermus
    ("Hypholoma capnoides", "species"),    # edible twin of H. fasciculare
    ("Volvariella volvacea", "species"),   # paddy straw
    # Cultivated mushrooms not already covered.
    ("Hypsizygus tessulatus", "species"),   # shimeji; NOT "tessellatus"
    ("Tremella fuciformis", "species"),
    # Culinary herbs. Parsley is the other safety-relevant one: hemlock and
    # fool's parsley are both flagged, parsley itself was not present.
    ("Ocimum basilicum", "species"),
    ("Petroselinum crispum", "species"),
    ("Coriandrum sativum", "species"),
    ("Anethum graveolens", "species"),
    ("Allium schoenoprasum", "species"),
    ("Laurus nobilis", "species"),
    ("Salvia officinalis", "species"),
    ("Thymus vulgaris", "species"),
    ("Salvia rosmarinus", "species"),      # iNat moved rosemary out of Rosmarinus
    ("Origanum majorana", "species"),
    ("Melissa officinalis", "species"),
    ("Artemisia dracunculus", "species"),
    ("Levisticum officinale", "species"),
    ("Mentha spicata", "species"),
]

CULTIVATED_NAMES = {name for name, _ in CULTIVATED}
CATALOG_NAMES = {name for name, _ in CATALOG}
TOXIC_NAMES = {name for name, _ in TOXIC}

INAT_API = "https://api.inaturalist.org/v1"
USER_AGENT = "funges-bioclip-spike/1.0 (+https://fung.es)"
MODEL_HUB_ID = "hf-hub:imageomics/bioclip-2"

# Recency filter — reduces (cannot eliminate) training overlap. Must span at
# least one full autumn: most toxic fungi here fruit Sep-Nov, and a window
# starting in the current calendar year contains no autumn at all, which
# silently starved Amanita virosa, Entoloma sinuatum, Cortinarius rubellus and
# Lepiota brunneoincarnata — the deadly half of the label set the gate needs.
SINCE = "2025-01-01"
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


def render_report(results):
    """Markdown report. The gate goes first — it is what can kill the feature."""
    m = results["methods"]
    lines = [
        "# BioCLIP 2 spike results",
        "",
        "## 1. The gate — false-edible rate",
        "",
        f"Toxic test photos: n={results['n_toxic']}",
        "",
        "| Method | False-edible @1 | False-edible @3 |",
        "| --- | --- | --- |",
    ]
    for key, label in (("text", "Text-prompt"), ("gallery", "Gallery")):
        row = m.get(key, {})
        lines.append(
            f"| {label} | {row.get('false_edible_1', 0):.1%} "
            f"| {row.get('false_edible_3', 0):.1%} |"
        )

    lines += [
        "",
        "## 2. Catalog accuracy",
        "",
        f"Catalog test photos: n={results['n_catalog']}",
        "",
        "| Method | Top-1 | Top-3 | Ships as |",
        "| --- | --- | --- | --- |",
        f"| Text-prompt | {m['text']['top1']:.1%} | {m['text']['top3']:.1%} | model only |",
        f"| Gallery | {m['gallery']['top1']:.1%} | {m['gallery']['top3']:.1%} | model + embeddings |",
        "",
        "## 3. Worst toxic confusions",
        "",
        "| Toxic photo | Predicted as | Rate |",
        "| --- | --- | --- |",
    ]
    for row in results["confusions"]:
        lines.append(
            f"| {row['toxic']} | {row['predicted']} "
            f"| {row['rate']:.0%} ({row['count']}/{row['n']}) |"
        )

    lines += [
        "",
        "## 4. Confidence threshold sweep",
        "",
        "| Min confidence | False-edible @1 | Toxic n | Answered | Top-1 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in results["sweep"]:
        # toxic_n MUST be shown: false_edible is 0.0 for an empty toxic sample,
        # so without it a cutoff that measured nothing looks like the safest
        # row in the table — the one a reader would pick to ship.
        lines.append(
            f"| {row['cutoff']:.2f} | {row['false_edible']:.1%} "
            f"| {row['toxic_n']} | {row['answered']:.0%} | {row['top1']:.1%} |"
        )

    lines += ["", "## 5. Excluded / insufficient data", ""]
    for name, reason in results["excluded"].items():
        lines.append(f"- {name}: {reason}")

    lines += [
        "",
        "---",
        "",
        "**Leakage caveat:** iNaturalist is one of BioCLIP's training sources, so "
        "recency filtering reduces but cannot eliminate overlap. Treat the "
        "accuracy figures as an optimistic ceiling. The false-edible rate remains "
        "the trustworthy signal — it measures a decision boundary, not "
        "memorization.",
    ]
    return "\n".join(lines)


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
                # iNat URLs are .../photos/<photo_id>/<size>.jpg, so the photo
                # id is a PATH SEGMENT and the basename is always "medium.jpg".
                # Using the basename made every photo of one observation collide
                # onto a single file; download()'s resume check then reported
                # success without writing, so the manifest gained a row per
                # photo while only one image existed. That silently inflated
                # sample counts (defeating the MIN_TEST guard) and let one
                # specimen carry several photos' worth of weight in the metrics.
                url_path = Path(urllib.parse.urlparse(photo["url"]).path)
                fname = (
                    f"{name.replace(' ', '_')}_{photo['observation_id']}"
                    f"_{url_path.parent.name}{url_path.suffix}"
                )
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

    # One manifest row must mean one distinct image. A filename scheme that
    # collides silently inflates every sample count downstream, so fail loudly
    # here rather than report confident numbers over duplicated photos.
    files = [row["file"] for row in manifest]
    if len(files) != len(set(files)):
        dupes = sorted({f for f in files if files.count(f) > 1})[:5]
        raise SystemExit(
            f"filename collision: {len(files)} rows, {len(set(files))} distinct "
            f"files. Sample: {dupes}"
        )

    (CACHE / "manifest.json").write_text(
        json.dumps({"photos": manifest, "dropped": dropped}, indent=2),
        encoding="utf-8",
    )
    print(f"\nfetched {len(manifest)} photos, dropped {dropped}")


EXPECTED_MEAN = (0.48145466, 0.4578275, 0.40821073)
EXPECTED_STD = (0.26862954, 0.26130258, 0.27577711)


def _describe_preprocess(preprocess):
    """Print and sanity-check the transform's resize/normalise settings.

    The browser must reproduce this pipeline exactly (Phase 2 parity test). If a
    checkpoint uses different constants, that must be visible here rather than
    discovered as unexplained accuracy loss later.
    """
    for t in getattr(preprocess, "transforms", []):
        name = type(t).__name__
        if name == "Resize":
            print(f"    Resize size={t.size} interpolation={t.interpolation}")
        elif name == "CenterCrop":
            print(f"    CenterCrop size={t.size}")
        elif name == "Normalize":
            mean = tuple(round(float(x), 8) for x in t.mean)
            std = tuple(round(float(x), 8) for x in t.std)
            print(f"    Normalize mean={mean} std={std}")
            if not (
                all(abs(a - b) < 1e-6 for a, b in zip(mean, EXPECTED_MEAN))
                and all(abs(a - b) < 1e-6 for a, b in zip(std, EXPECTED_STD))
            ):
                raise SystemExit(
                    "preprocess constants differ from the documented OpenCLIP "
                    "values.\n"
                    f"  got  mean={mean} std={std}\n"
                    f"  want mean={EXPECTED_MEAN} std={EXPECTED_STD}\n"
                    "The browser parity pipeline hardcodes these — update both "
                    "together or embeddings will silently diverge."
                )


def load_model(model_id=None):
    """BioCLIP via open_clip. Imported lazily so fetch/evaluate need no torch.

    model_id defaults to MODEL_HUB_ID. Passed explicitly (rather than editing the
    constant) so the run records which model produced which embeddings — a
    hand-edited constant leaves no trace of what was actually measured.
    """
    import open_clip
    import torch

    model_id = model_id or MODEL_HUB_ID
    model, _, preprocess = open_clip.create_model_and_transforms(model_id)
    tokenizer = open_clip.get_tokenizer(model_id)
    model.eval()
    return model, preprocess, tokenizer, torch


def stage_embed(batch_size=32, model_id=None):
    """images -> spike_cache/embeddings.npy (L2-normalised, manifest order)."""
    import numpy as np
    from PIL import Image

    manifest_path = CACHE / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit("no manifest.json — run --stage fetch first")
    photos = json.loads(manifest_path.read_text())["photos"]

    model, preprocess, tokenizer, torch = load_model(model_id)

    # Record which model produced these embeddings, and assert the preprocessing
    # constants are what we expect. Different open_clip checkpoints can ship
    # different resize/normalise settings; a silent mismatch would shift every
    # embedding with no error, which is this project's characteristic failure.
    active_id = model_id or MODEL_HUB_ID
    print(f"  model: {active_id}")
    _describe_preprocess(preprocess)

    # --- image embeddings ---
    vectors, kept = [], []
    for start in range(0, len(photos), batch_size):
        chunk = photos[start : start + batch_size]
        tensors, chunk_kept = [], []
        for row in chunk:
            try:
                img = Image.open(CACHE / "images" / row["file"]).convert("RGB")
            except Exception:
                continue
            tensors.append(preprocess(img))
            chunk_kept.append(row)
        if not tensors:
            continue
        with torch.no_grad():
            feats = model.encode_image(torch.stack(tensors))
            feats /= feats.norm(dim=-1, keepdim=True)
        vectors.append(feats.cpu().numpy())
        kept.extend(chunk_kept)
        print(f"  embedded {len(kept)}/{len(photos)}")

    np.save(CACHE / "embeddings.npy", np.concatenate(vectors))

    # --- text embeddings, one prompt per label ---
    lineages = json.loads((CACHE / "lineages.json").read_text())
    names = sorted(lineages)
    prompts = [taxonomic_prompt(lineages[n]) for n in names]
    with torch.no_grad():
        tfeats = model.encode_text(tokenizer(prompts))
        tfeats /= tfeats.norm(dim=-1, keepdim=True)
    np.save(CACHE / "text_embeddings.npy", tfeats.cpu().numpy())

    (CACHE / "embed_order.json").write_text(
        json.dumps(
            {"photos": kept, "text_labels": names, "model_id": active_id},
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"embedded {len(kept)} images, {len(names)} text prompts")


def _predictions(sims, label_names, test_rows):
    """similarity matrix -> Prediction dicts (softmax over labels for confidence)."""
    import numpy as np

    preds = []
    for i, row in enumerate(test_rows):
        scores = sims[i]
        order = np.argsort(-scores)
        exp = np.exp((scores - scores.max()) * 100.0)   # CLIP logit scale
        probs = exp / exp.sum()
        preds.append(
            {
                "truth": row["label"],
                "truth_kind": row["kind"],
                "ranked": [label_names[j] for j in order],
                "confidence": float(probs[order[0]]),
            }
        )
    return preds


def evaluate_embeddings(vectors, text_vectors, photos, text_labels):
    """Compute the full results dict from embeddings. No disk I/O.

    Factored out of stage_evaluate so the ONNX/quantized export path
    (bioclip_export.py) scores its artifact with EXACTLY this code. A second
    copy of the metric logic would let the shipped artifact be measured by
    subtly different arithmetic than the research model was.
    """
    import numpy as np

    # embed_order and embeddings are joined POSITIONALLY. A length mismatch
    # pairs every photo with another photo's vector and yields confident
    # nonsense, so refuse rather than report.
    if len(photos) != len(vectors):
        raise SystemExit(
            f"embed_order/embeddings mismatch: {len(photos)} rows vs "
            f"{len(vectors)} vectors — re-run --stage embed"
        )

    test_idx = [i for i, p in enumerate(photos) if p["split"] == "test"]
    test_rows = [photos[i] for i in test_idx]

    # insufficient-data guard: thin labels must not hide in an average
    counts = {}
    for row in test_rows:
        counts[row["label"]] = counts.get(row["label"], 0) + 1
    excluded = {
        name: f"{n} test photos — insufficient (min {MIN_TEST})"
        for name, n in counts.items()
        if n < MIN_TEST
    }
    excluded["Tuber melanosporum"] = "dropped from label set — subterranean"

    # A label that fetched ZERO photos never enters `counts`, so without this it
    # never enters `excluded` either and vanishes from the report entirely — the
    # report would look complete while missing deadly look-alikes. Name them.
    for name, _rank, kind in all_labels():
        if name not in counts and name not in excluded:
            excluded[name] = f"NO photos fetched ({kind}) — absent from the evaluation"
    scored = [
        i for i, row in zip(test_idx, test_rows) if row["label"] not in excluded
    ]
    rows = [photos[i] for i in scored]
    test_vectors = vectors[scored]

    # --- method A: text-prompt zero-shot ---
    preds_text = _predictions(test_vectors @ text_vectors.T, text_labels, rows)

    # --- method B: gallery prototypes ---
    proto_labels, protos = [], []
    for name in text_labels:
        gallery_idx = [
            i
            for i, p in enumerate(photos)
            if p["split"] == "gallery" and p["label"] == name
        ]
        if not gallery_idx:
            continue
        mean = vectors[gallery_idx].mean(axis=0)
        protos.append(mean / np.linalg.norm(mean))
        proto_labels.append(name)
    preds_gallery = _predictions(
        test_vectors @ np.array(protos).T, proto_labels, rows
    )

    # The gate compares predicted labels against CATALOG_NAMES by exact string
    # match. If a label ever reaches here in a different form (different case,
    # whitespace, "Boletus edulis" vs "Boletus"), the `in` check silently misses
    # and false_edible_rate UNDER-REPORTS danger — the one direction of error
    # this spike must never make. Assert the contract instead of trusting it.
    known = CATALOG_NAMES | TOXIC_NAMES
    for preds in (preds_text, preds_gallery):
        unknown = {r for p in preds for r in p["ranked"]} - known
        if unknown:
            raise SystemExit(
                f"label contract violated, gate would under-report: {sorted(unknown)[:5]}"
            )

    def summarise(preds):
        return {
            "top1": top_k_accuracy(preds, k=1),
            "top3": top_k_accuracy(preds, k=3),
            "false_edible_1": false_edible_rate(preds, CATALOG_NAMES, k=1),
            "false_edible_3": false_edible_rate(preds, CATALOG_NAMES, k=3),
        }

    best = preds_gallery if preds_gallery else preds_text
    results = {
        "methods": {"text": summarise(preds_text), "gallery": summarise(preds_gallery)},
        "n_toxic": sum(1 for p in preds_text if p["truth_kind"] == "toxic"),
        "n_catalog": sum(1 for p in preds_text if p["truth_kind"] == "catalog"),
        "confusions": worst_confusions(best, CATALOG_NAMES, limit=10),
        "sweep": threshold_sweep(
            best, CATALOG_NAMES, cutoffs=[0.0, 0.4, 0.55, 0.7, 0.85], k=1
        ),
        "excluded": excluded,
    }

    return results


def stage_evaluate():
    """embeddings -> report (stdout markdown + spike_cache/report.json)."""
    import numpy as np

    if not (CACHE / "embeddings.npy").exists():
        raise SystemExit("no embeddings.npy — run --stage embed first")

    order = json.loads((CACHE / "embed_order.json").read_text())
    results = evaluate_embeddings(
        np.load(CACHE / "embeddings.npy"),
        np.load(CACHE / "text_embeddings.npy"),
        order["photos"],
        order["text_labels"],
    )

    report = render_report(results)
    print("\n" + report)
    (CACHE / "report.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    (CACHE / "report.md").write_text(report, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--stage",
        choices=["fetch", "embed", "evaluate", "all"],
        default="all",
    )
    ap.add_argument("--since", default=SINCE)
    ap.add_argument(
        "--model-id",
        default=None,
        help=f"open_clip hub id to embed with (default {MODEL_HUB_ID})",
    )
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
        print("== embed ==")
        stage_embed(model_id=args.model_id)
    if args.stage in ("evaluate", "all"):
        print("== evaluate ==")
        stage_evaluate()


if __name__ == "__main__":
    main()
