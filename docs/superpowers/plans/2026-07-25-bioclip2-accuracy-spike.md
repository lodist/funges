# BioCLIP 2 Accuracy Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a throwaway evaluation script that measures whether BioCLIP 2 can rank fung.es catalog species correctly without ranking an edible species first on photos of toxic look-alikes.

**Architecture:** One script, `backend/tools/bioclip_spike.py`, with three disk-cached stages (`fetch` → `embed` → `evaluate`) selected by `--stage`. Caching between stages exists so metrics can be iterated on repeatedly without re-fetching ~2900 photos or re-loading a 2GB model. Pure functions (splitting, metrics, prompts, report) are unit-tested; the two I/O stages are verified by smoke runs.

**Tech Stack:** Python 3, stdlib `urllib` (matching `build_season_curves.py`), `open_clip_torch` + `torch` for BioCLIP 2, `PIL` for images, `numpy` for embeddings, `pytest` for the pure-function tests.

**Spec:** [2026-07-25-bioclip2-accuracy-spike-design.md](../specs/2026-07-25-bioclip2-accuracy-spike-design.md)

---

## Deviation from spec (deliberate, flagged)

The spec said "one `assert`-based self-check … no framework, no fixtures." This plan uses `pytest` files with plain asserts and no fixtures instead, because `tests/conftest.py` **already** inserts `backend/tools` into `sys.path`, and `pytest` is already in `backend/requirements-dev.txt`. Hand-rolling a `--self-check` flag would mean writing a test runner that is already installed and wired. This honors the spec's intent (no new machinery, no fixtures) with less code.

Pure logic is tested. The model and the iNaturalist API are not mocked — mocking a 2GB model for a throwaway spike is exactly the over-engineering the spec rejected. Those are verified by running them on a tiny slice.

## File Structure

| File                                           | Responsibility                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create: `backend/tools/bioclip_spike.py`       | Entire spike: label data, 3 stages, metrics, report. Single file per spec (~400 lines).                                                                  |
| Create: `backend/tools/requirements-spike.txt` | `torch` + `open_clip_torch` + `pillow`, kept **out** of `backend/requirements.txt` so scheduled scoring/maplayer jobs never pull a 2GB torch dependency. |
| Create: `tests/test_bioclip_spike.py`          | Unit tests for pure functions: observation split, metrics, prompt builder, report.                                                                       |
| Modify: `.gitignore`                           | Ignore `spike_cache/` (downloaded photos + embeddings, never committed).                                                                                 |

Deletion criterion: if the spike says no, delete all four changes (three files + one `.gitignore` line).

---

## Task 1: Skeleton, label set, dependencies

**Files:**

- Create: `backend/tools/requirements-spike.txt`
- Create: `backend/tools/bioclip_spike.py`
- Modify: `.gitignore`

- [ ] **Step 1: Create the spike-only requirements file**

Create `backend/tools/requirements-spike.txt`:

```text
# Spike-only deps. Deliberately NOT in backend/requirements.txt — the scheduled
# scoring/maplayer jobs must not pull ~2GB of torch.
# Install with: pip install -r backend/tools/requirements-spike.txt
torch
open_clip_torch
pillow
numpy
```

- [ ] **Step 2: Ignore the cache directory**

In `.gitignore`, after the `.superpowers/` block, add:

```text
# BioCLIP spike cache (downloaded photos + embeddings)
spike_cache/
```

- [ ] **Step 3: Create the script with the label set**

Create `backend/tools/bioclip_spike.py`:

```python
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
```

- [ ] **Step 4: Verify the label set is the right size**

Run:

```bash
python backend/tools/bioclip_spike.py --list-labels | tail -3
```

Expected last line: `31 catalog + 22 toxic = 53 labels`

If the count is wrong, the `CATALOG` list is wrong. Cross-check it against the app with:

```bash
python - <<'PY'
import re, pathlib
src = pathlib.Path("src/data/species.ts").read_text(encoding="utf-8")
real = {n.replace(" spp.", "") for n in re.findall(r"^    scientificName: '([^']+)'", src, re.M)}
real -= {"Tuber melanosporum"}
plan = pathlib.Path("backend/tools/bioclip_spike.py").read_text(encoding="utf-8")
block = plan.split("CATALOG = [")[1].split("]")[0]
planned = set(re.findall(r'\("([^"]+)", "(?:species|genus)"\)', block))
print("missing:", sorted(real - planned), "extra:", sorted(planned - real))
print("MATCH" if real == planned else "MISMATCH")
PY
```

Expected: `missing: [] extra: []` and `MATCH`.

- [ ] **Step 5: Commit**

```bash
git add backend/tools/bioclip_spike.py backend/tools/requirements-spike.txt .gitignore
git commit -m "spike: scaffold BioCLIP 2 evaluation with 53-label set"
```

---

## Task 2: Observation-level split (leakage-critical)

This is the highest-risk pure function in the spike. One iNaturalist observation usually holds several near-identical photos of the same specimen; splitting on photo id instead of observation id would leak near-duplicates into both the gallery and the test set, inflate the gallery method's score, and produce a **wrong architecture conclusion**. Test first.

**Files:**

- Create: `tests/test_bioclip_spike.py`
- Modify: `backend/tools/bioclip_spike.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_bioclip_spike.py`:

```python
from bioclip_spike import split_by_observation


def _obs(obs_id, n_photos):
    return {
        "observation_id": obs_id,
        "photo_urls": [f"https://x/{obs_id}_{i}.jpg" for i in range(n_photos)],
    }


def test_split_never_shares_an_observation():
    # 10 observations, 3 photos each
    obs = [_obs(i, 3) for i in range(10)]
    gallery, test = split_by_observation(obs, gallery_n=9, test_n=9)

    gallery_obs = {p["observation_id"] for p in gallery}
    test_obs = {p["observation_id"] for p in test}
    assert gallery_obs & test_obs == set(), "observation leaked across the split"


def test_split_respects_requested_counts():
    obs = [_obs(i, 3) for i in range(10)]
    gallery, test = split_by_observation(obs, gallery_n=9, test_n=9)
    assert len(gallery) == 9
    assert len(test) == 9


def test_split_is_deterministic():
    obs = [_obs(i, 3) for i in range(10)]
    a = split_by_observation(obs, gallery_n=9, test_n=9)
    b = split_by_observation(obs, gallery_n=9, test_n=9)
    assert a == b


def test_split_returns_what_it_can_when_data_is_thin():
    # only 2 observations, 1 photo each -> cannot fill 9+9
    obs = [_obs(i, 1) for i in range(2)]
    gallery, test = split_by_observation(obs, gallery_n=9, test_n=9)
    assert len(gallery) == 1
    assert len(test) == 1
    assert {p["observation_id"] for p in gallery} & {
        p["observation_id"] for p in test
    } == set()


def test_split_prefers_filling_test_set_over_gallery():
    # 3 observations, 1 photo each, want 2 gallery + 2 test.
    # Test set is what the metrics are computed from, so it wins.
    obs = [_obs(i, 1) for i in range(3)]
    gallery, test = split_by_observation(obs, gallery_n=2, test_n=2)
    assert len(test) == 2
    assert len(gallery) == 1
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -v
```

Expected: collection error — `ImportError: cannot import name 'split_by_observation'`

- [ ] **Step 3: Implement the split**

In `backend/tools/bioclip_spike.py`, add after `all_labels()`:

```python
def split_by_observation(observations, gallery_n, test_n):
    """Split photos into (gallery, test) with NO observation in both.

    observations: [{"observation_id": int, "photo_urls": [str, ...]}]
    Returns two lists of {"observation_id", "url"} dicts.

    Splitting on observation id (not photo id) is mandatory: one observation
    holds several near-identical photos of one specimen, so a photo-level split
    would put duplicates in both sets and inflate the gallery method.

    Test set is filled first — it is what the metrics are computed from.
    Deterministic: observations are processed in sorted id order.
    """
    ordered = sorted(observations, key=lambda o: o["observation_id"])

    test, gallery = [], []
    for obs in ordered:
        photos = [
            {"observation_id": obs["observation_id"], "url": u}
            for u in obs["photo_urls"]
        ]
        if len(test) < test_n:
            test.extend(photos[: test_n - len(test)])
        elif len(gallery) < gallery_n:
            gallery.extend(photos[: gallery_n - len(gallery)])
        else:
            break

    return gallery, test
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/tools/bioclip_spike.py tests/test_bioclip_spike.py
git commit -m "spike: add observation-level split with leakage test"
```

---

## Task 3: Metrics — the gate, accuracy, confusions

These four functions produce every number in the report. Their bugs are indistinguishable from results, which is precisely why they get tests.

Shared data shape used by all of them:

```python
Prediction = {
    "truth": str,          # true scientific name
    "truth_kind": str,     # "catalog" | "toxic"
    "ranked": [str, ...],  # predicted labels, best first
    "confidence": float,   # top-1 confidence, 0..1
}
```

**Files:**

- Modify: `tests/test_bioclip_spike.py`
- Modify: `backend/tools/bioclip_spike.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_bioclip_spike.py`:

```python
from bioclip_spike import (
    false_edible_rate,
    top_k_accuracy,
    worst_confusions,
    threshold_sweep,
)

CATALOG_SET = {"Cantharellus cibarius", "Allium ursinum", "Boletus"}


def _pred(truth, kind, ranked, confidence=0.9):
    return {
        "truth": truth,
        "truth_kind": kind,
        "ranked": ranked,
        "confidence": confidence,
    }


def test_top_k_accuracy_ignores_toxic_predictions():
    preds = [
        # catalog, correct at rank 1
        _pred("Boletus", "catalog", ["Boletus", "Amanita muscaria"]),
        # catalog, correct at rank 2
        _pred(
            "Allium ursinum",
            "catalog",
            ["Colchicum autumnale", "Allium ursinum"],
        ),
        # toxic photo — must not count toward catalog accuracy at all
        _pred("Amanita phalloides", "toxic", ["Amanita phalloides"]),
    ]
    assert top_k_accuracy(preds, k=1) == 0.5
    assert top_k_accuracy(preds, k=2) == 1.0


def test_false_edible_rate_counts_only_toxic_photos():
    preds = [
        # toxic photo ranked as an edible -> DANGEROUS, counts
        _pred(
            "Omphalotus olearius",
            "toxic",
            ["Cantharellus cibarius", "Omphalotus olearius"],
        ),
        # toxic photo ranked as toxic at 1, edible at 2 -> safe at k=1, bad at k=2
        _pred(
            "Colchicum autumnale",
            "toxic",
            ["Colchicum autumnale", "Allium ursinum"],
        ),
        # catalog photo -> irrelevant to this metric
        _pred("Boletus", "catalog", ["Cantharellus cibarius"]),
    ]
    assert false_edible_rate(preds, CATALOG_SET, k=1) == 0.5
    assert false_edible_rate(preds, CATALOG_SET, k=2) == 1.0


def test_false_edible_rate_is_zero_with_no_toxic_photos():
    preds = [_pred("Boletus", "catalog", ["Boletus"])]
    assert false_edible_rate(preds, CATALOG_SET, k=1) == 0.0


def test_worst_confusions_ranks_toxic_to_edible_pairs():
    preds = [
        _pred("Omphalotus olearius", "toxic", ["Cantharellus cibarius"]),
        _pred("Omphalotus olearius", "toxic", ["Cantharellus cibarius"]),
        _pred("Omphalotus olearius", "toxic", ["Omphalotus olearius"]),
        _pred("Colchicum autumnale", "toxic", ["Allium ursinum"]),
    ]
    out = worst_confusions(preds, CATALOG_SET, limit=5)

    assert out[0]["toxic"] == "Omphalotus olearius"
    assert out[0]["predicted"] == "Cantharellus cibarius"
    assert out[0]["rate"] == 2 / 3    # 2 of that species' 3 photos
    assert out[0]["n"] == 3
    # Colchicum -> Allium is 1/1 = 1.0 but has fewer photos; both present
    assert {row["toxic"] for row in out} == {
        "Omphalotus olearius",
        "Colchicum autumnale",
    }


def test_threshold_sweep_trades_coverage_for_safety():
    preds = [
        # low-confidence dangerous call — a cutoff should suppress it
        _pred(
            "Omphalotus olearius",
            "toxic",
            ["Cantharellus cibarius"],
            confidence=0.30,
        ),
        # high-confidence safe call — should survive every cutoff
        _pred(
            "Amanita phalloides",
            "toxic",
            ["Amanita phalloides"],
            confidence=0.95,
        ),
    ]
    rows = threshold_sweep(preds, CATALOG_SET, cutoffs=[0.0, 0.5], k=1)

    assert rows[0]["cutoff"] == 0.0
    assert rows[0]["answered"] == 1.0
    assert rows[0]["false_edible"] == 0.5

    assert rows[1]["cutoff"] == 0.5
    assert rows[1]["answered"] == 0.5       # the 0.30 pred is withheld
    assert rows[1]["false_edible"] == 0.0   # and so the danger is gone
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -v
```

Expected: collection error — `ImportError: cannot import name 'false_edible_rate'`

- [ ] **Step 3: Implement the metrics**

In `backend/tools/bioclip_spike.py`, add after `split_by_observation`:

```python
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
    """Ranked toxic->edible top-1 confusions. An aggregate is not actionable."""
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
    """Per cutoff: resulting false-edible rate and share of photos answered.

    Decides whether the feature can have an honest "I'm not sure" state and
    what that costs in coverage.
    """
    rows = []
    for cutoff in cutoffs:
        answered = [p for p in preds if p["confidence"] >= cutoff]
        rows.append(
            {
                "cutoff": cutoff,
                "answered": len(answered) / len(preds) if preds else 0.0,
                "false_edible": false_edible_rate(answered, catalog_names, k),
                "top1": top_k_accuracy(answered, k=1),
            }
        )
    return rows
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -v
```

Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add backend/tools/bioclip_spike.py tests/test_bioclip_spike.py
git commit -m "spike: add false-edible gate, accuracy, confusion and sweep metrics"
```

---

## Task 4: Taxonomic prompt builder

BioCLIP is trained on full taxonomic strings, not bare species names, so prompts must be built from the lineage. The lineage comes free from the same iNaturalist taxon lookup used in Task 5.

**Files:**

- Modify: `tests/test_bioclip_spike.py`
- Modify: `backend/tools/bioclip_spike.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_bioclip_spike.py`:

```python
from bioclip_spike import taxonomic_prompt


def test_taxonomic_prompt_uses_full_lineage():
    lineage = {
        "kingdom": "Fungi",
        "phylum": "Basidiomycota",
        "class": "Agaricomycetes",
        "order": "Cantharellales",
        "family": "Cantharellaceae",
        "genus": "Cantharellus",
        "species": "Cantharellus cibarius",
    }
    assert taxonomic_prompt(lineage) == (
        "a photo of Fungi Basidiomycota Agaricomycetes Cantharellales "
        "Cantharellaceae Cantharellus cibarius."
    )


def test_taxonomic_prompt_skips_missing_ranks():
    lineage = {"kingdom": "Fungi", "genus": "Boletus"}
    assert taxonomic_prompt(lineage) == "a photo of Fungi Boletus."


def test_taxonomic_prompt_does_not_repeat_the_genus():
    # iNat species names include the genus; emitting both would duplicate it
    lineage = {"genus": "Amanita", "species": "Amanita phalloides"}
    assert taxonomic_prompt(lineage) == "a photo of Amanita phalloides."
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -k prompt -v
```

Expected: collection error — `ImportError: cannot import name 'taxonomic_prompt'`

- [ ] **Step 3: Implement the prompt builder**

In `backend/tools/bioclip_spike.py`, add after the metrics:

```python
RANKS = ["kingdom", "phylum", "class", "order", "family", "genus", "species"]


def taxonomic_prompt(lineage):
    """Build BioCLIP's taxonomic prompt from a rank->name mapping.

    BioCLIP is trained on full lineage strings, so bare species names
    underperform. Missing ranks are skipped. The genus is not repeated when a
    binomial species name already contains it.
    """
    parts = []
    for rank in RANKS:
        name = lineage.get(rank)
        if not name:
            continue
        if rank == "species" and parts and name.startswith(parts[-1] + " "):
            parts[-1] = name          # "Amanita" + "Amanita phalloides"
        else:
            parts.append(name)
    return "a photo of " + " ".join(parts) + "."
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -v
```

Expected: 13 passed

- [ ] **Step 5: Commit**

```bash
git add backend/tools/bioclip_spike.py tests/test_bioclip_spike.py
git commit -m "spike: add BioCLIP taxonomic prompt builder"
```

---

## Task 5: iNaturalist client and fetch stage

I/O against a live, rate-limited API. Not unit-tested (see the deviation note) — verified by a smoke run on two labels.

**Files:**

- Modify: `backend/tools/bioclip_spike.py`

- [ ] **Step 1: Add the HTTP helper with backoff**

In `backend/tools/bioclip_spike.py`, extend the imports at the top:

```python
import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
```

Then add after `taxonomic_prompt`:

```python
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
```

- [ ] **Step 2: Add taxon resolution**

Append to `backend/tools/bioclip_spike.py`:

```python
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
```

- [ ] **Step 3: Add the download helper and fetch stage**

Append to `backend/tools/bioclip_spike.py`:

```python
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
        labels = [row for row in labels if row[0] in only]

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
```

- [ ] **Step 4: Wire the stage into main and smoke-test on two labels**

In `main()`, replace `raise SystemExit("stages not implemented yet")` with:

```python
    CACHE.mkdir(parents=True, exist_ok=True)
    if args.stage in ("fetch", "all"):
        print("== fetch ==")
        stage_fetch(args.since, only=args.only)
    if args.stage in ("embed", "all"):
        raise SystemExit("embed not implemented yet")
```

and add this argument next to `--list-labels`:

```python
    ap.add_argument(
        "--only",
        nargs="*",
        help="restrict to these scientific names (for smoke runs)",
    )
```

Run the smoke test:

```bash
python backend/tools/bioclip_spike.py --stage fetch --only "Cantharellus cibarius" "Omphalotus olearius"
```

Expected: two `NAME: N obs -> 25 gallery / 30 test` lines, then `fetched ~110 photos, dropped 0`. Verify the images are real:

```bash
ls spike_cache/images | head -3 && ls spike_cache/images | wc -l
```

Expected: filenames like `Cantharellus_cibarius_<obsid>_medium.jpg`, count around 110.

- [ ] **Step 5: Commit**

```bash
git add backend/tools/bioclip_spike.py
git commit -m "spike: add iNaturalist fetch stage with backoff and resume"
```

---

## Task 6: Embed stage

**Files:**

- Modify: `backend/tools/bioclip_spike.py`

- [ ] **Step 1: Install the spike dependencies**

Run:

```bash
pip install -r backend/tools/requirements-spike.txt
```

Expected: torch, open_clip_torch, pillow installed. This is a large download (~2GB of wheels).

- [ ] **Step 2: Verify the model id before writing any embedding code**

`MODEL_HUB_ID` is unverified — confirm it resolves before building on it. Run:

```bash
python -c "import open_clip; m,_,p = open_clip.create_model_and_transforms('hf-hub:imageomics/bioclip-2'); print(type(m).__name__, sum(x.numel() for x in m.parameters()))"
```

Expected: a model class name and a parameter count in the hundreds of millions.

If it raises a repo-not-found error, list the available BioCLIP repos and update `MODEL_HUB_ID` to the correct one:

```bash
python -c "from huggingface_hub import list_models; [print(m.id) for m in list_models(author='imageomics')]"
```

- [ ] **Step 3: Implement the embed stage**

In `backend/tools/bioclip_spike.py`, add after `stage_fetch`:

```python
def load_model():
    """BioCLIP 2 via open_clip. Imported lazily so fetch/evaluate need no torch."""
    import open_clip
    import torch

    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_HUB_ID)
    tokenizer = open_clip.get_tokenizer(MODEL_HUB_ID)
    model.eval()
    return model, preprocess, tokenizer, torch


def stage_embed(batch_size=32):
    """images -> spike_cache/embeddings.npy (L2-normalised, manifest order)."""
    import numpy as np
    from PIL import Image

    manifest_path = CACHE / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit("no manifest.json — run --stage fetch first")
    photos = json.loads(manifest_path.read_text())["photos"]

    model, preprocess, tokenizer, torch = load_model()

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
        json.dumps({"photos": kept, "text_labels": names}, indent=2),
        encoding="utf-8",
    )
    print(f"embedded {len(kept)} images, {len(names)} text prompts")
```

- [ ] **Step 4: Wire it into main and smoke-test**

In `main()`, replace `raise SystemExit("embed not implemented yet")` with:

```python
        print("== embed ==")
        stage_embed()
    if args.stage in ("evaluate", "all"):
        raise SystemExit("evaluate not implemented yet")
```

Run on the ~110 photos already fetched:

```bash
python backend/tools/bioclip_spike.py --stage embed
```

Expected: progress lines, then `embedded ~110 images, 2 text prompts`. Verify shapes:

```bash
python -c "import numpy as np; a=np.load('spike_cache/embeddings.npy'); t=np.load('spike_cache/text_embeddings.npy'); print(a.shape, t.shape); print('unit norm:', abs(np.linalg.norm(a[0])-1) < 1e-3)"
```

Expected: two 2-D shapes with matching second dimension, and `unit norm: True`.

- [ ] **Step 5: Commit**

```bash
git add backend/tools/bioclip_spike.py
git commit -m "spike: add BioCLIP 2 embedding stage"
```

---

## Task 7: Evaluate stage and report

**Files:**

- Modify: `tests/test_bioclip_spike.py`
- Modify: `backend/tools/bioclip_spike.py`

- [ ] **Step 1: Write the failing test for report rendering**

Append to `tests/test_bioclip_spike.py`:

```python
from bioclip_spike import render_report


def test_report_leads_with_the_gate_and_flags_leakage():
    results = {
        "methods": {
            "text": {"top1": 0.54, "top3": 0.76, "false_edible_1": 0.18},
            "gallery": {"top1": 0.71, "top3": 0.89, "false_edible_1": 0.06},
        },
        "n_toxic": 612,
        "n_catalog": 890,
        "confusions": [
            {
                "toxic": "Omphalotus olearius",
                "predicted": "Cantharellus cibarius",
                "rate": 0.31,
                "count": 9,
                "n": 29,
            }
        ],
        "sweep": [
            {"cutoff": 0.0, "answered": 1.0, "false_edible": 0.06, "top1": 0.71},
            {"cutoff": 0.7, "answered": 0.48, "false_edible": 0.012, "top1": 0.83},
        ],
        "excluded": {"Tuber melanosporum": "dropped — subterranean"},
    }
    out = render_report(results)

    # the gate comes first, before any accuracy number
    assert out.index("False-edible") < out.index("Top-1")
    # the named confusion is present, not just an aggregate
    assert "Omphalotus olearius" in out
    assert "Cantharellus cibarius" in out
    # leakage caveat must survive into the report
    assert "optimistic" in out.lower()
    # exclusions printed explicitly
    assert "Tuber melanosporum" in out
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -k report -v
```

Expected: collection error — `ImportError: cannot import name 'render_report'`

- [ ] **Step 3: Implement report rendering**

In `backend/tools/bioclip_spike.py`, add after the metrics:

```python
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
        "| Min confidence | False-edible @1 | Answered | Top-1 |",
        "| --- | --- | --- | --- |",
    ]
    for row in results["sweep"]:
        lines.append(
            f"| {row['cutoff']:.2f} | {row['false_edible']:.1%} "
            f"| {row['answered']:.0%} | {row['top1']:.1%} |"
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -v
```

Expected: 14 passed

- [ ] **Step 5: Implement the evaluate stage**

In `backend/tools/bioclip_spike.py`, add after `stage_embed`:

```python
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


def stage_evaluate():
    """embeddings -> report (stdout markdown + spike_cache/report.json)."""
    import numpy as np

    if not (CACHE / "embeddings.npy").exists():
        raise SystemExit("no embeddings.npy — run --stage embed first")

    vectors = np.load(CACHE / "embeddings.npy")
    text_vectors = np.load(CACHE / "text_embeddings.npy")
    order = json.loads((CACHE / "embed_order.json").read_text())
    photos, text_labels = order["photos"], order["text_labels"]

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

    report = render_report(results)
    print("\n" + report)
    (CACHE / "report.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    (CACHE / "report.md").write_text(report, encoding="utf-8")
```

- [ ] **Step 6: Wire it into main and smoke-test on the two-label cache**

In `main()`, replace `raise SystemExit("evaluate not implemented yet")` with:

```python
        print("== evaluate ==")
        stage_evaluate()
```

Run:

```bash
python backend/tools/bioclip_spike.py --stage evaluate
```

Expected: a markdown report. With only _Cantharellus_ and _Omphalotus_ fetched it is a 2-label problem, so numbers will be meaningless — the point is that it renders without crashing and the false-edible section is populated.

- [ ] **Step 7: Commit**

```bash
git add backend/tools/bioclip_spike.py tests/test_bioclip_spike.py
git commit -m "spike: add evaluate stage and report rendering"
```

---

## Task 8: Full run

**Files:** none modified — this task produces the answer.

- [ ] **Step 1: Confirm the whole test suite passes**

Run:

```bash
python -m pytest tests/test_bioclip_spike.py -v
```

Expected: 14 passed

- [ ] **Step 2: Fetch all 53 labels**

Run:

```bash
python backend/tools/bioclip_spike.py --stage fetch
```

Expected: 53 label lines, then `fetched ~2400-2900 photos, dropped <N>`. This takes roughly 45-60 minutes at 1 req/sec. It is resume-safe — if interrupted, re-run the same command.

Watch for labels reporting far fewer than 55 photos; those will surface as "insufficient data" in the report. If more than about a third of labels are thin, loosen recency and re-run:

```bash
python backend/tools/bioclip_spike.py --stage fetch --since 2025-01-01
```

Record in the final summary whether the recency window was loosened — it weakens the leakage argument.

- [ ] **Step 3: Embed everything**

Run:

```bash
python backend/tools/bioclip_spike.py --stage embed
```

Expected: `embedded ~2400-2900 images, 53 text prompts`. Minutes-to-tens-of-minutes on CPU.

- [ ] **Step 4: Produce the report**

Run:

```bash
python backend/tools/bioclip_spike.py --stage evaluate
```

Expected: the five-block markdown report, also written to `spike_cache/report.md`.

- [ ] **Step 5: Commit the report and stop**

The report is the deliverable, so it goes in the repo even though the cache does not:

```bash
cp spike_cache/report.md docs/superpowers/specs/2026-07-25-bioclip2-spike-results.md
git add docs/superpowers/specs/2026-07-25-bioclip2-spike-results.md
git commit -m "spike: BioCLIP 2 evaluation results"
```

**Do not** proceed to build a feature. Read block 1 and block 4 first, then decide:

- **False-edible @1 is low and a usable cutoff exists in block 4** → a candidate-narrowing feature is worth speccing. That is a new brainstorming session, and the hosting/on-device question is settled by the gallery-vs-text delta in block 2.
- **False-edible @1 is high, or no cutoff trades safely** → delete the four files. That is a successful spike: it cost an afternoon instead of an inference stack.

---

## Self-Review

**Spec coverage:**

| Spec requirement                                            | Task                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| One file in `backend/tools/`, 3 cached stages               | 1, 5, 6, 7                                       |
| 31 catalog + 22 toxic = 53 labels                           | 1                                                |
| Genus handling for Boletus/Morchella                        | 1 (`"genus"` rank), 4 (prompt)                   |
| Tuber dropped from label set                                | 1 (absent from CATALOG), 7 (named in `excluded`) |
| iNat research-grade, `--since 2026-01-01`, loosening logged | 5, 8 step 2                                      |
| Split by observation, 25 gallery / 30 test                  | 2                                                |
| Insufficient-data guard at 15                               | 7 step 5                                         |
| Method A: text-prompt zero-shot                             | 4, 6, 7                                          |
| Method B: gallery prototypes                                | 7 step 5                                         |
| Report block 1: false-edible gate, first                    | 7 (test asserts ordering)                        |
| Report block 2: both methods + "ships as"                   | 7                                                |
| Report block 3: named confusions                            | 3, 7                                             |
| Report block 4: threshold sweep                             | 3, 7                                             |
| Report block 5: exclusions                                  | 7                                                |
| Rate limit 1/sec + Retry-After backoff                      | 5 step 1                                         |
| Resume-safe downloads                                       | 5 step 3 (`download` early-returns)              |
| Broken photos counted, not silently dropped                 | 5 step 3 (`dropped` in manifest)                 |
| Missing cache fails loudly                                  | 6, 7 (`raise SystemExit`)                        |
| Leakage caveat in the report                                | 7 (test asserts it)                              |
| Metric arithmetic tested                                    | 2, 3                                             |
| torch kept out of production requirements                   | 1 step 1                                         |

No spec requirement is unimplemented.

**Placeholder scan:** No TBD/TODO. One flagged item carried deliberately: `Cichorium intybus` in `CATALOG` is marked with a `NOTE` and Task 1 Step 4 requires verifying it against `src/data/species.ts`. It exists because the source file yields 33 unique names and one must be reconciled by eye during implementation; the step makes that explicit rather than silent.

**Type consistency:** `Prediction` keys (`truth`, `truth_kind`, `ranked`, `confidence`) are identical across Task 3's tests, `_predictions`, and all four metric functions. Manifest row keys (`file`, `label`, `kind`, `split`, `observation_id`) are written in Task 5 and read unchanged in Tasks 6 and 7. `split_by_observation` returns `{observation_id, url}` dicts, matching its consumer in `stage_fetch`. `CATALOG_NAMES` is the single source of "is this edible" for every metric.
