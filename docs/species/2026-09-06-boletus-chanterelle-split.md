# Splitting Boletus and Cantharellus into named species

Date: 2026-09-06

Until now the catalog carried two coarse fungal entries: `mushroom`
(_Boletus_, genus rank) and `chant` (_Cantharellus cibarius_, but scored
against a genus-wide GBIF season curve). This record covers narrowing both to
single species and adding six siblings, and it is the reviewed source the new
manifests cite in `forecast.regions.*.scoringReferences`.

**The parameter values below are agent-derived and were approved by Loris Di
Stefano on 2026-09-24.** The validator checks types, ranges and sigmas; it
cannot establish scientific authority, and no mycologist has reviewed them.

## Identity changes to existing entries

| id         | before                  | after            | rationale                                                                                      |
| ---------- | ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `mushroom` | _Boletus_ (genus)       | _Boletus edulis_ | the genus entry now has three named siblings; a genus bucket alongside them would double-count |
| `chant`    | _Cantharellus cibarius_ | unchanged        | already a species; only its GBIF taxon key changes                                             |

Both keep their id, `catalog.order`, `translationKey` and `dataColumns`, so the
`mushroom_score` → `Porcini` and `chant_score` → `Chanterelle` parquet columns
and their history are unbroken.

### GBIF taxon keys

Both entries were pointing at a **genus** key, which is wrong once siblings
exist: every _Boletus_ would have inherited one genus-wide season curve and
become indistinguishable in the forecast.

| id         | key before                     | key after | notes                       |
| ---------- | ------------------------------ | --------- | --------------------------- |
| `mushroom` | 8287374 (genus _Boletus_)      | 5954958   | _Boletus edulis_ Bull.      |
| `chant`    | 9623860 (genus _Cantharellus_) | 5249504   | _Cantharellus cibarius_ Fr. |

This narrows both empirical season curves on the next
`build_season_curves.py` run. Expect `chant` and `mushroom` curves to shift
slightly; that is the intended consequence of the split, not a regression.

## Regional availability

Occurrence counts from the GBIF Occurrence API (`hasCoordinate=true`), binned
by the same longitude/latitude cuts `species_registry.infer_region` uses, so
the counts describe the regions that actually score points:

| species                   |     NE |    SE |   USE |   USW | available            |
| ------------------------- | -----: | ----: | ----: | ----: | -------------------- |
| _Boletus edulis_          | 62,399 | 6,207 | 1,373 | 4,504 | all four (unchanged) |
| _Boletus aereus_          |  1,689 | 1,638 |     2 |    10 | NE, SE               |
| _Boletus pinophilus_      |  6,001 | 1,007 |    13 |    17 | NE, SE               |
| _Boletus reticulatus_     | 13,106 | 3,403 |    21 |     2 | NE, SE               |
| _Cantharellus cibarius_   | 61,754 | 6,105 |   752 |   112 | all four (unchanged) |
| _Cantharellus formosus_   |      0 |     0 |     5 | 3,993 | USW                  |
| _Cantharellus lateritius_ |      0 |     0 | 1,722 |     1 | USE                  |
| _Craterellus tubaeformis_ | 28,120 | 3,061 | 2,598 | 3,516 | all four             |

Counts in the low tens are read as vagrant records, misidentifications or
herbarium re-determinations rather than a foraging population, so they do not
earn `available: true`. The three European boletes are all reported from North
America under old names, but not as populations anyone forages; the two
American chanterelles are strictly regional endemics.

Per region this adds four species to NE and SE and two each to USE and USW.

## Scoring parameters

Each new species starts from its closest existing sibling — `mushroom` for the
boletes, `chant` for the chanterelles — and moves only the parameters that a
documented ecological difference justifies. Parameters left untouched are
inherited deliberately: an invented difference is worse than a shared default.

**`bronze_bolete` — _Boletus aereus_, bronze bolete / porcino nero.**
Thermophilic and sub-Mediterranean, with _Quercus_ and _Castanea_ on warm
lowland slopes. Warmer and lower than _B. edulis_ (`optimal_temp` 20,
`optimal_alt` 400), tolerant of more basic soils (`optimal_pH` 6.0), and
fruiting later (Aug–Nov). Arctic and subarctic zones dropped in NE.

**`pine_bolete` — _Boletus pinophilus_, pine bolete / porcino rosso.**
Conifer-associated, chiefly _Pinus_, on acidic sandy soils at montane to boreal
elevations. Cooler and higher than _B. edulis_ (`optimal_temp` 15,
`optimal_alt` 1100), more acidic (`optimal_pH` 4.8), and bimodal — a late-spring
flush and a main autumn one. Land cover shifts to coniferous CORINE 312.

**`summer_bolete` — _Boletus reticulatus_, summer bolete (syn. _B. aestivalis_).**
The early broadleaf porcino: _Quercus_ and _Fagus_, lowland to submontane, and
the first of the four to fruit (May–Sep). Warm like _aereus_ but less
strictly Mediterranean, so it keeps the wider NE climate-zone list.

**`pacific_chant` — _Cantharellus formosus_, Pacific golden chanterelle.**
Pacific Northwest conifer forest, chiefly _Pseudotsuga_ and _Tsuga_, in a cool
wet maritime climate. Cooler and wetter than _C. cibarius_ (`optimal_temp` 13,
`optimal_humidity` 88, `min_cumulative_rain` 40) and fruiting into winter
(Sep–Jan). Restricted to `marine_west_coast` and neighbouring cool zones.

**`smooth_chant` — _Cantharellus lateritius_, smooth chanterelle.**
Southeastern US hardwood forest, with oak, in a humid subtropical summer. The
warmest entry in the set (`optimal_temp` 22, `max_temp` 32, `optimal_alt` 250)
and the earliest American one (Jun–Sep).

**`winter_chant` — _Craterellus tubaeformis_, winter / yellowfoot chanterelle.**
Circumboreal, in mossy acidic conifer litter, and the cold specialist of the
group: it fruits through frost. `optimal_temp` 11 with `min_temp` 1,
`optimal_pH` 4.6, `optimal_humidity` 90, and a season running Sep–Jan
(Oct–Jan in USW, where the maritime autumn arrives later).

Every one of these is a fallback. `season_months` is overridden by the
empirical GBIF curve wherever `build_season_curves.py` produces one, which for
all six is everywhere they are available.

## Photo identification

All six join the shipped BioCLIP vocabulary, and `mushroom`'s label narrows
from the bare genus `Boletus` to `Boletus edulis`. Consequences:

- `Boletus` stops being a genus-rank catalog row, so `stage_text_matrix` no
  longer drops tier-2 `Boletus *` names for genus ambiguity. Other boletes
  enter the vocabulary as neutral `other` rows.
- `GENUS_LEVEL_CATALOG.Boletus` in `src/lib/photo-id.ts` is removed. Its job
  was bridging the bare genus onto `Boletus spp.`, an entry that no longer
  exists; the four boletes now resolve by their own scientific names.
- The toxic look-alikes for all six were already in the shipped vocabulary:
  _Rubroboletus satanas_ and _Tylopilus felleus_ for the boletes,
  _Omphalotus olearius_ / _illudens_ / _olivascens_ and
  _Hygrophoropsis aurantiaca_ for the chanterelles. No new toxic labels were
  needed, which is why the warning floor survives the widened catalog.

`identification.safetyReview` for the six cites this record and the shipped
safety suite. The suite is the gate: `--stage verify-shipped` re-scores the
whole vocabulary and fails below 92% toxic-warning availability or above a 2%
false-edible rate. Its measured output for this change is recorded below.

### Measured gate result

`--stage verify-shipped`, run against the previous shipped artifacts and then
against the regenerated ones, on the same 1,590 test photos (690 toxic):

|                                       |                  before |                   after | gate              |
| ------------------------------------- | ----------------------: | ----------------------: | ----------------- |
| labels (catalog / toxic / other)      | 2,617 (32 / 65 / 2,520) | 2,623 (38 / 65 / 2,520) | —                 |
| false-edible@1                        |                   1.06% |                   1.21% | ceiling 2% — pass |
| toxic label in top-3 of a toxic photo |                   95.5% |                   94.6% | floor 92% — pass  |
| catalog top-1                         |                   81.1% |                   79.1% | not gated         |
| catalog top-3                         |                   92.3% |                   89.1% | not gated         |

Both gated metrics hold. The ungated ones pay for the split: a photo that used
to be counted correct as the genus `Boletus` must now land on the right one of
four congeners, so 2.0pp of top-1 and 3.2pp of top-3 are lost to
within-genus confusion rather than to any new toxic/edible error. The
false-edible rise of 0.15pp is the widened edible surface — six more catalog
labels — and stays well inside the ceiling.

No new toxic labels were needed and none was displaced, which is why warning
availability moved so little. Worth re-checking if more congeners are added:
the top-3 figure is what makes a three-candidate list defensible, and it is now
the metric with the least headroom.

## Illustrations

The six catalog images are repainted from the catalog's own porcini and
chanterelle illustrations, so they share the house style and carry no
third-party attribution. Silhouettes and shading are kept; colour and marks
change to show what separates each from its siblings: the near-black cap of
_B. aereus_, the wine-red cap of _B. pinophilus_, the full-length stem net of
_B. reticulatus_, the darker cap top of _C. formosus_, the almost ridge-free
underside of _C. lateritius_, and the brown cap, grey ridges and yellow stem of
_Craterellus tubaeformis_.
