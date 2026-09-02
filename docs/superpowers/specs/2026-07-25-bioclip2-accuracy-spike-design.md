# BioCLIP 2 Accuracy Spike — Design

**Date:** 2026-07-25
**Status:** Approved, ready for implementation plan
**Scope:** Throwaway evaluation script. No app code, no hosting, no UI.

## Purpose

Decide whether BioCLIP 2 is accurate enough on realistic photos to justify
building a photo-identification feature in fung.es — **before** any of that
feature is built.

The deliverable is a number, not a feature:

> Can BioCLIP 2 rank the catalog's edible species correctly without putting an
> edible species on top of a photo of a toxic look-alike?

If the answer is no, the outcome is deleting one file. Nothing else in the
repository is touched.

## Why a spike first

fung.es today runs zero live inference. The backend is scheduled batch jobs
(`backend/EU/**`, `backend/US/**`) that write static Parquet and PMTiles to
Cloudflare R2; the frontend is a static PWA. Adding photo ID means adding an
inference path — a hosted endpoint, or a ~100-150MB on-device model download, or
both — which is a substantial infrastructure commitment.

That commitment rests on an unverified assumption: that published BioCLIP 2
benchmark accuracy (curated, single-subject, iNaturalist-quality photos)
survives contact with a user's blurry phone photo of a mushroom in leaf litter.
Measuring that costs an afternoon. Assuming it costs a rebuild.

Note also: `src/lib/api.ts:220-255` already contains dead `classifyImage` /
`classifyMultiple` scaffolding pointing at `https://api.fung.es/classify`. It is
imported by nothing and no such backend exists. Whether to delete or use it is
**out of scope here** — a decision for the feature spec, if there is one.

## Non-goals (explicit)

- No changes under `src/`
- No model hosting, no Cloudflare Worker, no HF endpoint
- No quantization, no ONNX export, no WebGPU work
- No service-worker or offline-download UX
- No UI of any kind
- Not a benchmark reproduction — published numbers are not the question

## Architecture

One file: `backend/tools/bioclip_spike.py`. That directory already holds
run-occasionally tooling (`build_season_curves.py`), so it fits existing
structure.

Three functions, disk cache between each stage:

| Stage        | Input → output                                           | Why it is cached                                          |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------- |
| `fetch()`    | iNaturalist API → `spike_cache/images/`, `manifest.json` | Slow and rate-limited; must never re-fetch when iterating |
| `embed()`    | images → `embeddings.npy`                                | ~2GB model load plus minutes of CPU                       |
| `evaluate()` | embeddings + manifest → report                           | Fast; will be re-run many times while reading results     |

Caching between stages is the entire reason for three stages instead of one
blob: metrics get iterated on ten times, fetching happens once. `--stage
evaluate` skips straight to the last stage.

Model access: `imageomics/bioclip-2` from HuggingFace via `open_clip`. One
~2GB weights download. A few hundred images embed on CPU in minutes — no GPU,
no cloud, no Colab needed.

## Data

### Source

iNaturalist API, research-grade observations only, filtered by observation date
to `--since 2025-01-01` (a script constant).

**The window must span at least one full autumn.** This was originally
`2026-01-01`, which — run in July 2026 — contained no autumn at all. Most of the
toxic fungi here fruit September-November, so the filter silently starved
exactly the half of the label set the gate depends on: _Amanita virosa_ returned
0 photos, _Entoloma sinuatum_ 2, _Cortinarius rubellus_ 6, _Lepiota
brunneoincarnata_ 12. The bias was seasonal, not random. Widening to 18 months
costs a little leakage margin and buys the deadly look-alikes back — a trade
worth making, since a gate measured without them is not a gate.

**Leakage is acknowledged, not solved.** iNaturalist is one of BioCLIP's
training sources. Recency filtering reduces overlap; it cannot eliminate it.
Therefore:

- Absolute accuracy figures are treated as an **optimistic ceiling**.
- The toxic-confusion rate remains the trustworthy signal, because it measures
  a decision boundary rather than memorization.

The report must state this caveat inline so a future reader does not mistake the
top-line accuracy for expected field performance.

### Label set: 31 catalog + 22 toxic = 53 labels

The catalog's 33 entries in `src/data/species.ts` collapse to 32 unique
scientific names (`elderberry` and `elderflower` are both _Sambucus nigra_ —
one label, two catalog ids mapping to it). One of those 32 is dropped, giving 31.

(Verified by `grep -cE "^    id: '" src/data/species.ts` → 33 and
`grep -E "^    scientificName:" … | sort -u | wc -l` → 32. A plain
`grep -c scientificName` returns 34 because it also matches the `interface`
declaration — do not use it.)

Special handling:

- `Boletus spp.` and `Morchella spp.` are genus-level → genus prompts,
  genus-level iNat queries.
- `Tuber melanosporum` is subterranean; every available photo is harvested
  truffles on a table. Photo ID of it is meaningless in the field → **dropped
  from the label set entirely** (not merely excluded from metrics), and the
  report states why.
- `Lentinula edodes` (shiitake) is cultivated and near-absent from wild EU/US
  observations → stays in the label set, but is expected to fall below the data
  threshold and be excluded from headline metrics.

Toxic labels need gallery photos too, since method B builds a prototype per
label. Total fetch: 53 labels × 55 photos ≈ 2900 images.

**Toxic labels are mandatory, not a nice-to-have.** The catalog is edible-only.
A model given only 31 edible labels is structurally incapable of outputting
"death cap" — it must return an edible for every photo, including photos of
lethal species. Including toxic labels is what makes any output safe to display,
and it doubles as the adversarial test set at no extra fetching cost.

Toxic set — 22 unique labels, derived from what the catalog's own entries get
confused with:

| Catalog entry            | Toxic look-alikes                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| _Cantharellus cibarius_  | _Omphalotus olearius_, _Hygrophoropsis aurantiaca_                                        |
| _Macrolepiota procera_   | _Chlorophyllum molybdites_, _Lepiota brunneoincarnata_, young _A. phalloides_             |
| _Calocybe gambosa_       | _Inosperma erubescens_, _Entoloma sinuatum_ (same season, same habitat)                   |
| _Morchella spp._         | _Gyromitra esculenta_, _Verpa bohemica_                                                   |
| _Boletus spp._           | _Rubroboletus satanas_, _Tylopilus felleus_                                               |
| _Pleurotus ostreatus_    | _Omphalotus_ spp.                                                                         |
| **_Allium ursinum_**     | **_Colchicum autumnale_, _Convallaria majalis_, _Arum maculatum_**                        |
| _Peucedanum ostruthium_  | _Conium maculatum_, _Aethusa cynapium_                                                    |
| _Vaccinium_ spp.         | _Atropa bella-donna_                                                                      |
| _Sambucus nigra_         | _Sambucus ebulus_                                                                         |
| (unconditional deadlies) | _A. phalloides_, _A. virosa_, _A. muscaria_, _Galerina marginata_, _Cortinarius rubellus_ |

The _Allium ursinum_ row is bolded deliberately: it is the deadliest confusion
in the catalog, and it is a plant, not a mushroom. Any evaluation that covers
only fungi misses it.

### Split discipline

**Split by observation id, never by photo id.** A single iNat observation
commonly carries four photos of the same specimen from near-identical angles.
Splitting on photo id would place near-duplicates in both the gallery and the
test set, inflating the gallery method's score and producing a false
architecture conclusion.

Per label: **25 gallery photos, 30 test photos, from disjoint observations.**

**Label names must be iNaturalist's accepted names, not textbook ones.** Two
lookups failed silently as "no species named": _Inocybe erubescens_ (iNat moved
it to _Inosperma erubescens_) and _Atropa belladonna_ (iNat spells it
_Atropa bella-donna_, with 8578 observations). Both are deadly look-alikes, and
both would simply have been absent from the gate.

**Insufficient-data guard:** any label yielding fewer than 15 test photos is
reported as "insufficient data" and excluded from headline metrics. A label that
fetches ZERO photos must also be named in the report: it never enters the
per-label counts, so without an explicit check it vanishes from the exclusions
list and the report looks complete while missing deadly species. Without this,
a label with 3 photos scores 100% and flatters the aggregate.

## Methods — measure both

Both rankings are computed in the same run. The fetch and embed passes are ~90%
of the work and are shared; the second ranking is a small addition.

**A. Text-prompt zero-shot.** Embed each label as text using BioCLIP's taxonomic
prompt format, embed the photo, rank by cosine similarity. Production cost:
ship the model only. Adding a species later is one line of text.

**B. Image-embedding gallery.** Embed the 25 gallery photos per label, average
into one prototype vector per label, classify by nearest prototype. Distance to
prototype provides a genuine "unknown / not in catalog" rejection signal.
Production cost: ship the model plus a small embeddings file (a few hundred KB
— which is exactly the kind of static asset R2 already serves).

Measuring both is not redundancy: **the delta between them is the production
architecture decision.** If A is sufficient, the feature ships a model. If B is
required, it ships a model plus embeddings. Deciding that from data now avoids
guessing later.

## Metrics & report

Printed to stdout as markdown, also written as JSON. Five blocks:

### 1. The gate — false-edible rate

Of test photos that are a toxic look-alike: how often does an edible label rank
#1, and how often does one appear in top-3? Reported with `n`.

This is the primary go/no-go metric and appears alone at the top. Rationale: a
model with 85% headline accuracy that calls jack-o'-lanterns chanterelles one
time in five is unshippable regardless of its headline number. Accuracy is
secondary to this.

The threshold itself is set after seeing the split, not committed to in advance.

### 2. Both methods side by side

Top-1, top-3, false-edible-#1, and a "ships as" column per method — so the
accuracy delta reads directly as an architecture cost.

### 3. Named worst confusions

Ranked toxic→edible pairs with rates. An aggregate rate is not actionable;
_"Omphalotus → Cantharellus, 31%"_ is.

### 4. Confidence threshold sweep

For a range of minimum-confidence cutoffs: resulting false-edible rate, and the
share of photos still answered.

This decides whether the feature can have an honest "I'm not sure" state, and
what that costs in coverage. A feature that safely answers half of submitted
photos is shippable; one that must answer all of them likely is not.

### 5. Exclusions and insufficient data

Printed explicitly, with reasons, so thin labels cannot hide inside an average.

## Error handling

- **iNat rate limits** — 1 req/sec, exponential backoff on 429/5xx.
- **Resume-safe downloads** — skip files already on disk; a killed run costs
  nothing.
- **Broken photos / missing labels** — skipped and counted; the report prints
  the number dropped rather than silently shrinking `n`.
- **Missing cache** — `--stage evaluate` without `embeddings.npy` fails loudly
  rather than quietly re-fetching thousands of photos.

## Testing

One `assert`-based self-check on the metric functions, using hand-built
synthetic rankings with obvious correct answers.

This tests the top-k and false-edible arithmetic — not the model. That
arithmetic is the code whose bugs are indistinguishable from results, which
makes it the one thing worth a check. No framework, no fixtures.

## Framing constraint for any downstream feature

Recorded here because it bounds what the spike's result can authorize:

Photo-only mushroom identification has a hard ceiling that no model quality
overcomes. Spore print color, gill attachment, bruising reaction, and smell —
frequently the features that separate an edible from a lethal look-alike — are
often not present in a photograph at all.

Any feature built on a positive spike result is therefore a **candidate-narrowing
tool** presented behind the app's existing safety disclaimer ("here are 3 likely
candidates, verify these features"). It is never a confirmation of edibility.
If a positive result gets read as license to build a "is this safe to eat?"
feature, the spike has been misused.

## Open questions deferred to the feature spec

- Where inference runs: hosted endpoint vs on-device WebGPU vs hybrid
- Whether the dead `api.ts` classification scaffolding is deleted or adopted
- Offline model-download UX (the realistic use case is weak forest signal, so
  pre-download at home is required, not optional)
- Confidence cutoff value, chosen from block 4 of the report
