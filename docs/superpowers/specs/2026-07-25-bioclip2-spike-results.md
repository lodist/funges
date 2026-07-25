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
