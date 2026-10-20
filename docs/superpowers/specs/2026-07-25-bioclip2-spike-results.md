# BioCLIP 2 Accuracy Spike — Results

**Date:** 2026-07-25
**Spec:** [2026-07-25-bioclip2-accuracy-spike-design.md](2026-07-25-bioclip2-accuracy-spike-design.md)
**Data:** 2915 iNaturalist photos, 53 labels (31 edible catalog + 22 toxic
look-alikes), observations from 2025-01-01 onward. 930 catalog + 660 toxic test
photos, gallery/test split by observation id.

## Verdict

**The gate passes at top-1, by a wide margin. The headline accuracy figures are
not trustworthy as field performance. One specific confusion needs engineering
before any feature ships.**

A candidate-narrowing feature is worth speccing. A confirm-edibility feature is
not, and nothing here changes that.

## 1. The gate — false-edible rate

Of 660 photos that ARE a toxic look-alike, how often does an edible species
appear in the top k? Compared against the random baseline, which matters because
31 of 53 labels (58%) are edible:

| k   | measured | random baseline | better than chance by |
| --- | -------- | --------------- | --------------------- |
| 1   | **1.4%** | 58.5%           | **57.1 points**       |
| 2   | 52.1%    | 83.2%           | 31.1                  |
| 3   | 77.1%    | 93.4%           | 16.3                  |
| 5   | 95.3%    | 99.1%           | 3.8                   |

Gallery method: 1.2% @1. Text-prompt: 1.4% @1. Essentially tied.

**Read k=1 as the real result: 1.4% against a 58.5% baseline.** The model puts
the correct toxic species first for 97.9% of toxic photos.

**The @3 figure of 77% is largely an artifact of my own metric design, not a
model failure.** With 58% of labels edible, an edible lands in a random top-3
93.4% of the time. "Is an edible present in top-3" therefore cannot discriminate
much — it was the wrong question to ask. The right question for a 3-candidate UI
is whether the toxic species is _also_ shown:

- **A toxic label appears in the top-3 for 99.8% of toxic photos.**
- The true toxic species is in the top-3 for 99.8%.

So a UI that lists 3 candidates and marks toxicity on each would surface a
warning on essentially every toxic specimen. The danger is not that an edible
appears in the list — it is a list that does not flag the toxic entry beside it.

## 2. Catalog accuracy — treat as an upper bound, not a measurement

| Method      | Top-1     | Top-3 | Ships as           |
| ----------- | --------- | ----- | ------------------ |
| Text-prompt | 97.4%     | 99.2% | model only         |
| Gallery     | **97.8%** | 99.4% | model + embeddings |

**These numbers are too good to believe, and should be read as evidence of
training-data leakage rather than of field accuracy.** 19 of 31 catalog labels
score exactly 100% top-1. Fine-grained species identification from real
photographs does not behave like that. iNaturalist is one of BioCLIP's training
sources, and widening the date window to 18 months (see below) increased the
overlap.

Expect materially lower accuracy on a user's phone photo. The weakest labels
hint at where real difficulty lies:

| Label              | Top-1 |
| ------------------ | ----- |
| _Boletus_          | 83%   |
| _Rubus fruticosus_ | 87%   |
| _Calocybe gambosa_ | 90%   |
| _Morchella_        | 90%   |
| _Allium ursinum_   | 93%   |

**Architecture consequence:** gallery (97.8%) beats text-prompt (97.4%) by 0.4
points and 1.2% vs 1.4% on the gate. That does not justify shipping an
embeddings file. **Text-prompt zero-shot is sufficient — ship the model only.**

## 3. Every toxic→edible top-1 confusion

| Toxic photo                    | Called                  | Rate           |
| ------------------------------ | ----------------------- | -------------- |
| **_Lepiota brunneoincarnata_** | _Macrolepiota procera_  | **13% (4/30)** |
| _Hygrophoropsis aurantiaca_    | _Cantharellus cibarius_ | 3% (1/30)      |
| _Inosperma erubescens_         | _Rumex acetosa_         | 3% (1/30)      |
| _Entoloma sinuatum_            | _Calocybe gambosa_      | 3% (1/30)      |
| _Rubroboletus satanas_         | _Boletus_               | 3% (1/30)      |
| _Sambucus ebulus_              | _Sambucus nigra_        | 3% (1/30)      |

**The first row is the actionable finding.** _Lepiota brunneoincarnata_ is
lethal (amatoxins, the same toxin class as the death cap) and it is being called
_Macrolepiota procera_ — the parasol mushroom, which is in the app's catalog — in
13% of cases, four times the rate of any other confusion. Any feature built on
this needs that pair handled explicitly, not left to the model.

The remaining five are all single instances at the resolution of a 30-photo
sample and should not be over-read individually. Note that four of the six are
lethal-or-serious species, so the tail is not benign.

## 4. Confidence thresholding buys almost nothing

| Min confidence | False-edible @1 | Toxic n | Answered | Top-1 |
| -------------- | --------------- | ------- | -------- | ----- |
| 0.00           | 1.2%            | 660     | 100%     | 97.8% |
| 0.55           | 1.1%            | 654     | 99%      | 98.2% |
| 0.70           | 0.9%            | 645     | 98%      | 98.7% |
| 0.85           | 0.8%            | 630     | 96%      | 99.2% |

An "I'm not sure" state is not worth building here. Raising the cutoff to 0.85
only moves the gate from 1.2% to 0.8% while still answering 96% — there is no
meaningful low-confidence tail to suppress, because the model is confidently
correct nearly always. Note `Toxic n` stays near 660 throughout, so these are
real reductions, not an emptying sample.

## 5. Exclusions

- _Tuber melanosporum_ — dropped from the label set (subterranean; every photo
  is harvested truffles on a table).

No label fell below the 15-photo floor, and no label failed to resolve.

## What this run cost to get right

Four problems surfaced only when running against real data, all of which
produced plausible output rather than errors:

1. **Seasonal starvation.** `--since 2026-01-01`, run in July, contained no
   autumn. Most toxic fungi here fruit Sep-Nov, so the filter starved the
   deadly half of the label set specifically: _Amanita virosa_ 0 photos,
   _Entoloma sinuatum_ 2, _Cortinarius rubellus_ 6, _Lepiota brunneoincarnata_ 12. Widened to 2025-01-01.
2. **Two labels used names iNaturalist rejects**, failing silently: _Inocybe
   erubescens_ is _Inosperma erubescens_ there; _Atropa belladonna_ is _Atropa
   bella-donna_ (8578 observations). Both are deadly look-alikes.
3. **Labels fetching zero photos were invisible** in the exclusions block, since
   they never entered the per-label counts. The report would have looked
   complete while omitting lethal species.
4. **Filename collisions** silently deduplicated photos: 110 manifest rows were
   backed by 64 real images, one image claimed by 8 rows, because iNat puts the
   photo id in a path segment and the basename is always `medium.jpg`.

Before the fixes: 50/53 labels, 16/22 toxic labels usable, 486 toxic test
photos. After: 53/53, 22/22, 660. Every one of these would have made the gate
look **better** than reality, because the hardest confusions were missing from
the sample.

## Caveats that bound this result

- **Leakage is unresolved and now larger.** The 18-month window was chosen to
  recover the autumn toxic species; it also increases training overlap. Accuracy
  is a ceiling, not an estimate.
- **iNaturalist photos are not user photos.** These are mostly well-framed,
  well-lit, single-subject images. A blurry phone photo of a mushroom in leaf
  litter is a different distribution.
- **Photo-only ID has a hard ceiling no model clears.** Spore print, gill
  attachment, bruising reaction and smell are frequently the features that
  separate edible from lethal, and they are often not in the photograph.
- **30 test photos per toxic label** puts the resolution of a single-species
  rate at ~3%. The 13% Lepiota figure is 4/30 — real, but wide.

## Recommendation

Proceed to a feature spec for a **candidate-narrowing** tool, with these
constraints carried in from the start:

1. **Ship the model only** — the gallery method's 0.4-point gain does not pay
   for an embeddings file.
2. **Every candidate must carry its toxicity status.** The 99.8% "toxic label in
   top-3" figure is what makes a 3-candidate list defensible; a list without
   flags is not, because 77% of toxic photos put an edible in the top 3.
3. **Handle _Lepiota brunneoincarnata_ / _Macrolepiota procera_ explicitly.** At
   13% this is the one confusion a user could plausibly be killed by.
4. **Do not build a confidence cutoff.** It buys 0.4 points for 4% of coverage.
5. **Never present this as confirmation of edibility.** It narrows candidates
   behind the existing safety disclaimer; it does not verify anything.

---

## Addendum — BioCLIP v1 (ViT-B/16) re-measurement

Run on the identical 2915 photos and 53 labels, to see whether the 3.5x smaller
model (~86MB int8 on-device vs ~304MB) clears the same bar.

**It does not.** The pre-agreed ceiling was 3.0% false-edible@1 (2x v2's 1.4%).

| Metric                        | v2 ViT-L/14 | v1 ViT-B/16 |
| ----------------------------- | ----------- | ----------- |
| False-edible@1, text-prompt   | 1.4%        | **8.6%**    |
| False-edible@1, gallery       | 1.2%        | **4.8%**    |
| False-edible@3, text-prompt   | 77.1%       | 78.6%       |
| Catalog top-1, text-prompt    | 97.4%       | 83.5%       |
| Catalog top-1, gallery        | 97.8%       | 91.1%       |
| _Lepiota_ -> parasol (lethal) | 13%         | **17%**     |

With the text-prompt method we planned to ship, v1 puts an edible species first
for roughly one in twelve toxic photos. It is also worse on the single lethal
confusion the report already flagged as needing explicit handling.

Two secondary findings:

- **The "ship the model only" conclusion was v2-specific.** For v2, gallery beat
  text-prompt by 0.4 points; for v1 the gap is 3.8 points (4.8% vs 8.6%), so v1
  would need the embeddings file too. It fails the gate regardless.
- **Preprocessing is identical between the two checkpoints** — bicubic resize to
  224, centre crop, same normalise constants — verified by an assertion added to
  `bioclip_spike.py`. One browser preprocessing pipeline therefore serves either
  model.

**Consequence:** the on-device artifact is BioCLIP 2 at roughly 304MB, not 86MB.
That is a materially harder download to justify to a user, and it reopens the
inference-location question the plan had settled.

Reproduce with:

```bash
python backend/tools/bioclip_spike.py --stage embed --model-id hf-hub:imageomics/bioclip
python backend/tools/bioclip_spike.py --stage evaluate
```

---

## Addendum 2 — Wide-vocabulary gate (1058 labels)

The plan required measuring the gate at a wider vocabulary before shipping
"tier 2" (species named but not in the app's catalog), on the reasoning that more
labels means more plausible-but-wrong neighbours. **That reasoning turned out to
be backwards.** Widening the vocabulary makes the gate _better_.

Method: 1005 additional species, the most-observed research-grade fungi and
plants in the app's own NE/SE/USE/USW bounding boxes, via iNaturalist
`/observations/species_counts`. No new photos — the gate is computed over the
same 660 toxic test photos, so extra labels only change what those photos
compete against. Script: `backend/tools/bioclip_wide_vocab.py`.

| Metric                               | 53 labels | 1058 labels | change      |
| ------------------------------------ | --------- | ----------- | ----------- |
| **False-edible@1** (the gate)        | 1.4%      | **0.9%**    | **-0.5pp**  |
| **Edible in top-3 of a toxic photo** | 77.1%     | **27.6%**   | **-49.5pp** |
| Toxic label present in top-3         | 99.8%     | 98.3%       | -1.5pp      |
| True toxic species ranked #1         | 97.9%     | 92.7%       | -5.2pp      |
| Catalog top-1                        | 97.4%     | 83.2%       | -14.2pp     |
| _Lepiota_ -> parasol (lethal pair)   | 13%       | 13%         | unchanged   |

**This confirms the 77% figure was an artifact of the label ratio, not a model
weakness.** At 53 labels, 58% of labels were edible, so an edible landed in any
top-3 almost by arithmetic necessity. At 1058 labels only 31 are edible (2.9%),
tier-2 neighbours fill those slots instead, and the rate collapses to 27.6%.

**The critical check passed.** The obvious risk was that tier-2 species would
displace the _toxic_ label too, silently removing the warning that makes a
3-candidate list defensible. It barely moves: a toxic label still appears in the
top-3 for 98.3% of toxic photos. So the warning survives while the misleading
edible mostly disappears — a strictly better safety position.

**The cost is catalog top-1, down 14.2pp to 83.2%.** That is the honest trade:
more competitors displace the true catalog species more often. Since the 97.4%
figure was leakage-inflated and never a field estimate, trading it for a halved
false-edible surface is worth taking for a safety-critical narrowing tool.

**_Lepiota_ -> _Macrolepiota_ stays at 13% at both vocabulary sizes.** It is a
genuine visual confusion, not a label-set artifact, and needs the explicit
handling the plan already specifies.

### Consequence for the shipped text matrix

At 1058 labels x 768 dims the matrix is **3.25MB as float32** — which exceeds
workbox's 2 MiB precache default and would make `vite build` **throw**. Options:
ship **float16 (1.63MB, precacheable)** and widen the dtype at load time, or keep
float32 and deliver by runtime caching. float16 is the simpler choice; verify the
gate is unchanged after the dtype narrowing, since it is a numerical change to
the classifier's own weights.

### Decision

Ship tier 2. Reproduce with:

```bash
python backend/tools/bioclip_wide_vocab.py --stage taxa --per-region 200
python backend/tools/bioclip_wide_vocab.py --stage evaluate
```

---

## Addendum 3 — the int8 artifact that actually ships

The spike measured a PyTorch fp32 model. What reaches a browser is a quantized
ONNX graph, so every gating number was re-measured against the real artifact
(`backend/tools/bioclip_export.py`).

**Export fidelity, asserted before quantizing:** `model.visual` reproduces
`encode_image` with a max absolute difference of exactly `0.00e+00` — so this
checkpoint keeps no projection outside `.visual`. The exported fp32 ONNX matches
PyTorch to `8.5e-07`. Both are assertions in the export stage, not observations,
because a silent mismatch there would shift every embedding the feature computes.

**Size:** 1216.6 MB fp32 -> **306.9 MB** dynamic weight-only int8 (4.0x).

### False-edible@1, the gate

| Vocabulary              | fp32 (spike) | int8 (ships) | delta       |
| ----------------------- | ------------ | ------------ | ----------- |
| 53 labels, text         | 1.4%         | 2.0%         | **+0.61pp** |
| 53 labels, gallery      | 1.2%         | 1.5%         | +0.30pp     |
| **1053 labels (ships)** | **0.91%**    | **1.06%**    | **+0.15pp** |

Ceiling was +1.00pp. Passes at both sizes, and the shipping configuration is
almost unaffected — more competing labels dilute quantization error's effect on
the top-1 decision.

Catalog top-1 barely moves: 97.4% -> 96.9% (text), 97.8% -> 97.8% (gallery).

### A gate that was wrong in the strict direction

The first run FAILED, and the failure was in the verification code, not the
model. The plan specified the ceiling on false-edible**@1**; the implementation
applied it to `@1` and `@3` alike, and `@3` regressed +1.52pp.

That mattered because **@3 at 53 labels is close to arithmetic**: its random
baseline is 93.4% there, and addendum 2 showed it falling to 27.6% at the
shipping vocabulary. A 1.5pp move on such a metric is noise, not a safety
signal. Rather than simply loosen the check, the fix narrowed it to `@1` as
specified **and added the check that was genuinely missing** — the gate at the
1053-label vocabulary that ships, rather than only the 53-label one the spike
happened to use.

### Text matrix

1053 labels x 768 dims, **float16, 1.62 MB**, bundled at
`public/models/bioclip_text_embeddings.f16.bin` with an index-aligned generated
`src/data/bioclip-labels.ts`. float32 would be 3.25 MB — over workbox's 2 MiB
precache default, which makes `vite build` throw rather than warn. The narrowing
costs nothing measurable (min cosine 1.000000 against fp32).

Reproduce:

```bash
python backend/tools/bioclip_export.py --stage export
python backend/tools/bioclip_export.py --stage quantize
python backend/tools/bioclip_export.py --stage verify
python backend/tools/bioclip_export.py --stage text-matrix
```

---

## Addendum 4 — a vocabulary balanced by kingdom (20 Oct 2026)

**Why.** The shipped list had 2,654 labels but only 273 fungi. One tier-2 cap
ranked fungi and plants together by iNaturalist sightings, and plants get 7–19×
more sightings, so plants took 89% of the slots. The sampling boxes were also out
of date: SE started at 12°E and USE stopped at 37.5°N, so Spain, Portugal,
France, the Alps, most of Italy and the US Northeast were never sampled. The
boxes now follow the scoring grids (NE, WE, EE, USE, USW), and each kingdom has
its own cap.

**A blind spot in the gate.** Its test photos are all catalog or toxic species,
so it cannot see what happens to the rest of what people photograph. A species
missing from the list is forced onto its nearest label, which can be an edible
one. A third test set now covers that: 1,200 photos of species that are neither
catalog nor toxic (800 fungi, 400 plants), drawn in proportion to research-grade
sightings in the five boxes, one photo per observation, newest first, embedded
through the shipped int8 graph (`bioclip_wide_vocab.py --stage others`).

**Genus caution.** A wider list brings in hundreds of species from dangerous
genera, too many to review one by one. A tier-2 species now shows "Toxic
relatives" and "its genus includes toxic species" instead of "no safety
information" when its genus has a toxic entry or is a genus on `DANGER_TAXA`.
Two exceptions: cultivated labels, so a champignon still shows no warning, and
four Apiaceae that are on the danger list only as hemlock look-alikes. Caution
rows count toward the 92% warning floor, because they carry a visible warning.

### Sweep

`bioclip_export.py --stage sweep`. The gate photos are the same 1,530 as before
(870 catalog, 660 toxic). F = fungi labels, P = plant labels.

| List                  | Labels |   MB | Edible first on a toxic photo | Catalog first | Catalog in top 3 | Warning in top 3 (toxic label only) |
| --------------------- | -----: | ---: | ----------------------------: | ------------: | ---------------: | ----------------------------------: |
| Shipped               |  2,654 |  4.1 |                         1.52% |         83.0% |            92.5% |                       97.7% (97.7%) |
| Shipped + caution     |  2,654 |  4.1 |                         1.52% |         83.0% |            92.5% |                       98.3% (97.7%) |
| 1,000 F + 5,000 P     |  6,141 |  9.4 |                         0.76% |         78.0% |            90.0% |                       96.7% (94.5%) |
| **2,000 F + 5,000 P** |  7,141 | 11.0 |                         0.45% |         76.7% |            89.7% |                       95.6% (92.9%) |
| 3,000 F + 5,000 P     |  8,141 | 12.5 |                         0.30% |         74.7% |            89.3% |                       95.6% (91.5%) |
| 4,000 F + 5,000 P     |  9,141 | 14.0 |                         0.30% |         73.7% |            88.7% |                       95.6% (90.5%) |
| 5,000 F + 5,000 P     |  9,779 | 15.0 |                         0.30% |         73.3% |            88.5% |                       95.5% (90.2%) |
| 3,000 F + 2,500 P     |  5,654 |  8.7 |                         0.30% |         77.5% |            90.0% |                       96.1% (91.8%) |

The others set, per kingdom (in the list / named first / an edible named first):

| List                  | Mushroom photos (800)              | Plant photos (400)  |
| --------------------- | ---------------------------------- | ------------------- |
| Shipped               | 49.1% / 42.6% / **4.00%** (32)     | 66.2% / 58.2% / 0.25% |
| 1,000 F + 5,000 P     | 84.4% / 65.0% / 0.75% (6)          | 88.8% / 73.5% / 0%  |
| **2,000 F + 5,000 P** | 92.2% / 67.2% / **0.50%** (4)      | 88.8% / 73.5% / 0%  |
| 3,000 F + 5,000 P     | 95.8% / 66.8% / 0.50% (4)          | 88.8% / 73.5% / 0%  |
| 4,000 F + 5,000 P     | 97.2% / 66.1% / 0.50% (4)          | 88.8% / 73.5% / 0%  |
| 5,000 F + 5,000 P     | 98.0% / 65.1% / 0.50% (4)          | 88.8% / 73.5% / 0%  |
| 3,000 F + 2,500 P     | 95.8% / 66.8% / 0.50% (4)          | 72.2% / 62.7% / 0.25% |

### Reading it

1. **Today's list names an edible species first for 1 in 25 ordinary mushroom
   photos** (32 of 800), a failure the gate could not see. Every balanced list
   cuts that to 4–6 of 800, and the original gate falls from 1.52% to 0.45%.
2. **The cost is our own species coming first less often:** 83.0% to 76.7%. Of
   the 198 catalog photos whose first answer is a species outside the catalog,
   97 get a species of the same genus: blackberry to _Rubus armeniacus_,
   chanterelle to _Cantharellus enelensis_, sweet chestnut to _Castanea
   mollissima_. Catalog top-3 moves less, 92.5% to 89.7%.
3. **Mushroom naming peaks at 2,000 fungi.** The 2,001st–3,000th species name 15
   of their own 28 test photos, but cost 19 photos of commoner species and push
   18 more catalog photos out of first place (parasol to _Macrolepiota pallida_,
   chicken of the woods to _Laetiporus huroniensis_). Past 3,000 every column
   stays flat or gets worse.
4. **Plants:** 5,000 rather than 2,500 names 10.8 points more plant photos for
   2.8 points of catalog top-1.
5. **The caution is what keeps the warning floor at a wide list.** On the
   shipped list it adds a warning to 0.6% more toxic photos. At 2,000 fungi it
   adds 2.7 points (92.9% to 95.6%), and at 3,000 the toxic labels alone would
   fall under the 92% floor.

### Decision

**2,000 fungi + 5,000 plants** (4,987 plant names survive the drops). The
expansion also brought in a third sibling earthball, _Scleroderma cepa_. Like _S.
areolatum_ and _S. verrucosum_ in July, it is promoted to toxic, so every
_Scleroderma_ stays fully flagged next to the truffle. Shipped: 7,142 labels
(55 catalog, 81 toxic, 434 caution, 6,572 other), an 11.0 MB matrix, 22 MB once
decoded in the browser. The decode now uses a 65,536-entry table: about 14 ms
on a desktop, against 61 ms for the old list with the old decode. The labels
file grows the precached `identify` chunk from 40 to 72 KB gzipped. The matrix
itself is runtime-cached, so only people who open Identify download it.

`--stage verify-shipped` on the generated artifacts:

| Metric                                          | Before          | After          |
| ----------------------------------------------- | --------------- | -------------- |
| Edible named first on a toxic photo             | 1.52%           | **0.45%**      |
| Warning in the top 3 of a toxic photo           | 97.7%           | 95.6%          |
| Catalog first / in top 3                        | 83.0% / 92.5%   | 76.7% / 89.7%  |
| Ordinary mushroom photos the list can name      | 49.1%           | 92.2%          |
| Ordinary mushroom photos named first            | 42.6%           | 67.4%          |
| Ordinary mushroom photo named as an edible      | **4.00%** (32)  | **0.50%** (4)  |
| Ordinary plant photos named first               | 58.2%           | 73.5%          |

### Caveats

- iNaturalist is in BioCLIP 2's training data, so "named first" is a ceiling.
  Newest-first sampling limits the leak but does not remove it. The comparison
  between list sizes is fair; the absolute rates are not field accuracy.
- 800 mushroom photos: one point is eight photos, so gaps under a point between
  neighbouring sizes are noise.
- Four species-level danger entries stay neutral, as before: _Hedera helix_,
  _Ilex aquifolium_, _Prunus laurocerasus_ and _Russula emetica_. They need full
  toxic entries rather than a genus caution.

Reproduce:

```bash
python backend/tools/bioclip_wide_vocab.py --stage taxa      # ~25 min, lineages cached
python backend/tools/bioclip_wide_vocab.py --stage others    # ~20 min
python backend/tools/bioclip_export.py --stage sweep
python backend/tools/bioclip_export.py --stage text-matrix
python backend/tools/bioclip_export.py --stage verify-shipped
```
