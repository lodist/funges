# Splitting Boletus and Cantharellus into named species

Date: 2026-09-06

Until now the catalog carried two coarse fungal entries: `mushroom`
(*Boletus*, genus rank) and `chant` (*Cantharellus cibarius*, but scored
against a genus-wide GBIF season curve). This record covers narrowing both to
single species and adding six siblings, and it is the reviewed source the new
manifests cite in `forecast.regions.*.scoringReferences`.

**The parameter values below are agent-derived and await human approval.** The
validator checks types, ranges and sigmas; it cannot establish scientific
authority. Nothing here has been signed off by a mycologist.

## Identity changes to existing entries

| id | before | after | rationale |
| --- | --- | --- | --- |
| `mushroom` | *Boletus* (genus) | *Boletus edulis* | the genus entry now has three named siblings; a genus bucket alongside them would double-count |
| `chant` | *Cantharellus cibarius* | unchanged | already a species; only its GBIF taxon key changes |

Both keep their id, `catalog.order`, `translationKey` and `dataColumns`, so the
`mushroom_score` → `Porcini` and `chant_score` → `Chanterelle` parquet columns
and their history are unbroken.

### GBIF taxon keys

Both entries were pointing at a **genus** key, which is wrong once siblings
exist: every *Boletus* would have inherited one genus-wide season curve and
become indistinguishable in the forecast.

| id | key before | key after | notes |
| --- | --- | --- | --- |
| `mushroom` | 8287374 (genus *Boletus*) | 5954958 | *Boletus edulis* Bull. |
| `chant` | 9623860 (genus *Cantharellus*) | 5249504 | *Cantharellus cibarius* Fr. |

This narrows both empirical season curves on the next
`build_season_curves.py` run. Expect `chant` and `mushroom` curves to shift
slightly; that is the intended consequence of the split, not a regression.

## Regional availability

Occurrence counts from the GBIF Occurrence API (`hasCoordinate=true`), binned
by the same longitude/latitude cuts `species_registry.infer_region` uses, so
the counts describe the regions that actually score points:

| species | NE | SE | USE | USW | available |
| --- | ---: | ---: | ---: | ---: | --- |
| *Boletus edulis* | 62,399 | 6,207 | 1,373 | 4,504 | all four (unchanged) |
| *Boletus aereus* | 1,689 | 1,638 | 2 | 10 | NE, SE |
| *Boletus pinophilus* | 6,001 | 1,007 | 13 | 17 | NE, SE |
| *Boletus reticulatus* | 13,106 | 3,403 | 21 | 2 | NE, SE |
| *Cantharellus cibarius* | 61,754 | 6,105 | 752 | 112 | all four (unchanged) |
| *Cantharellus formosus* | 0 | 0 | 5 | 3,993 | USW |
| *Cantharellus lateritius* | 0 | 0 | 1,722 | 1 | USE |
| *Craterellus tubaeformis* | 28,120 | 3,061 | 2,598 | 3,516 | all four |

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

**`bronze_bolete` — *Boletus aereus*, bronze bolete / porcino nero.**
Thermophilic and sub-Mediterranean, with *Quercus* and *Castanea* on warm
lowland slopes. Warmer and lower than *B. edulis* (`optimal_temp` 20,
`optimal_alt` 400), tolerant of more basic soils (`optimal_pH` 6.0), and
fruiting later (Aug–Nov). Arctic and subarctic zones dropped in NE.

**`pine_bolete` — *Boletus pinophilus*, pine bolete / porcino rosso.**
Conifer-associated, chiefly *Pinus*, on acidic sandy soils at montane to boreal
elevations. Cooler and higher than *B. edulis* (`optimal_temp` 15,
`optimal_alt` 1100), more acidic (`optimal_pH` 4.8), and bimodal — a late-spring
flush and a main autumn one. Land cover shifts to coniferous CORINE 312.

**`summer_bolete` — *Boletus reticulatus*, summer bolete (syn. *B. aestivalis*).**
The early broadleaf porcino: *Quercus* and *Fagus*, lowland to submontane, and
the first of the four to fruit (May–Sep). Warm like *aereus* but less
strictly Mediterranean, so it keeps the wider NE climate-zone list.

**`pacific_chant` — *Cantharellus formosus*, Pacific golden chanterelle.**
Pacific Northwest conifer forest, chiefly *Pseudotsuga* and *Tsuga*, in a cool
wet maritime climate. Cooler and wetter than *C. cibarius* (`optimal_temp` 13,
`optimal_humidity` 88, `min_cumulative_rain` 40) and fruiting into winter
(Sep–Jan). Restricted to `marine_west_coast` and neighbouring cool zones.

**`smooth_chant` — *Cantharellus lateritius*, smooth chanterelle.**
Southeastern US hardwood forest, with oak, in a humid subtropical summer. The
warmest entry in the set (`optimal_temp` 22, `max_temp` 32, `optimal_alt` 250)
and the earliest American one (Jun–Sep).

**`winter_chant` — *Craterellus tubaeformis*, winter / yellowfoot chanterelle.**
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
  *Rubroboletus satanas* and *Tylopilus felleus* for the boletes,
  *Omphalotus olearius* / *illudens* / *olivascens* and
  *Hygrophoropsis aurantiaca* for the chanterelles. No new toxic labels were
  needed, which is why the warning floor survives the widened catalog.

`identification.safetyReview` for the six cites this record and the shipped
safety suite. The suite is the gate: `--stage verify-shipped` re-scores the
whole vocabulary and fails below 92% toxic-warning availability or above a 2%
false-edible rate. Its measured output for this change is recorded below.

### Measured gate result

`--stage verify-shipped`, run against the previous shipped artifacts and then
against the regenerated ones, on the same 1,590 test photos (690 toxic):

| | before | after | gate |
| --- | ---: | ---: | --- |
| labels (catalog / toxic / other) | 2,617 (32 / 65 / 2,520) | 2,623 (38 / 65 / 2,520) | — |
| false-edible@1 | 1.06% | 1.21% | ceiling 2% — pass |
| toxic label in top-3 of a toxic photo | 95.5% | 94.6% | floor 92% — pass |
| catalog top-1 | 81.1% | 79.1% | not gated |
| catalog top-3 | 92.3% | 89.1% | not gated |

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

## Follow-up

- Species photographs. All six ship with a placeholder copied from `chant` or
  `mushroom` and carry no `source`/`author`/`license`, because none has been
  sourced or attributed yet. Replace before this reaches users.
- Human approval of the scoring parameters above.
