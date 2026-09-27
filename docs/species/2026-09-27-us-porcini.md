# US porcini: folding two keys into _B. edulis_ and adding two king boletes

Date: 2026-09-27 (roadmap #272, step 1)

Until now the US "Porcini" layer was _Boletus edulis_ alone. In the US
_edulis_ is mostly a western species (California, Washington, Oregon), so after
#266 narrowed `mushroom` to that one species, the Appalachians, the Southeast
and Colorado went low. The king boletes people pick there are other species.
This record covers the three changes that put them back on the map, and it is
the reviewed source the manifests cite in `scoringReferences` and
`identification.safetyReview`.

**The parameter values below are agent-derived and were approved by Loris Di
Stefano on 2026-09-27.** The validator checks types, ranges and sigmas; it
cannot establish scientific authority, and no mycologist has reviewed them.
They rest on GBIF and iNaturalist records and the 2026 weather at real
sightings, checked against the sources in [Literature check](#literature-check).

## Changes

| id             | name                | GBIF keys                                                                                             | regions                  |
| -------------- | ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| `mushroom`     | Porcini             | 5954958 _B. edulis_ + **6015464 _B. chippewaensis_ + 6015325 _B. subcaerulescens_**                   | NE, SE, USE, USW         |
| `eastern_king` | Eastern King Bolete | 2524722 _Xanthoconium separans_, 7240439 _B. variipes_, 6015430 _B. nobilis_, 6015920 _B. atkinsonii_ | USE, USW (range decides) |
| `rocky_king`   | Rocky Mountain King | 7769448 _B. rubriceps_                                                                                | USW, USE (range decides) |

All seven keys are accepted GBIF species. _Boletus separans_ (5239707) is filed
as a synonym of 2524722, so the accepted key already covers it.

## Records

GBIF human observations with coordinates in the US macro box
(24–49.5° N, 125.5–67° W, which also takes in southern Canada and northern
Mexico), split at the forecast seam (100° W). 1990–2025 builds the priors;
2026 is held out.

| taxon                | USE 1990–2025 | USW 1990–2025 | USE 2026 | USW 2026 |
| -------------------- | ------------: | ------------: | -------: | -------: |
| _B. edulis_          |           546 |         3,641 |       46 |      199 |
| _B. chippewaensis_   |           307 |             0 |       34 |        0 |
| _B. subcaerulescens_ |           185 |             0 |        6 |        0 |
| _X. separans_        |           794 |             0 |      119 |        0 |
| _B. variipes_        |           336 |             1 |       17 |        0 |
| _B. nobilis_         |           139 |             0 |        6 |        0 |
| _B. atkinsonii_      |            48 |             0 |        3 |        0 |
| _B. rubriceps_       |             0 |           843 |        0 |      124 |

- **Eastern King Bolete by state (all years):** Pennsylvania 360, Ohio 116,
  New York 113, North Carolina 113, Georgia 104, Virginia 99. The four species
  share oak and hardwood hosts and a summer season, and are hard to tell apart
  in the field, so they are forecast as one. _X. separans_ carries 60% of the
  records; the catalog names the group after _B. variipes_, its classic member
  and the photo-identification label.
- **_B. rubriceps_ by state (all years):** Colorado 636, Arizona 182, New Mexico
  99, Wyoming 15, South Dakota 7. Colorado has 636 _rubriceps_ records against
  10 for _edulis_.
- **_B. chippewaensis_ + _B. subcaerulescens_:** New England, the Great Lakes,
  Minnesota, Pennsylvania and Virginia. Long treated as varieties of _edulis_,
  they share its northern conifer hosts and fall season.

## Where they can grow: range prior and host trees

Following #275, no species stops at the USE/USW seam: both new species carry
the same scoring in both US regions, and the range prior and host layer decide
where they grow. The priors were built locally with
`backend/tools/build_range_priors.py`'s own functions (a rebuild of the
published _edulis_ prior matched R2 exactly), and the host factor was read
from the published `USA/US_host_cover.npz`.

"Hidden" is the share of real sightings where the combined factor is below 0.1.
"Observed ground excluded" is the share of 2026 fungi records whose ground the
factor rules out.

### Held-out 2026 sightings (US)

| species                          |   n | hidden (range) | hidden (hosts) | hidden (both) | score lost | observed ground excluded |
| -------------------------------- | --: | -------------: | -------------: | ------------: | ---------: | -----------------------: |
| porcini, `main` keys             | 216 |           0.5% |           4.2% |          4.6% |       6.6% |                    33.9% |
| **porcini, folded keys**         | 216 |       **0.0%** |           4.2% |      **4.2%** |       6.5% |                    32.0% |
| porcini, _edulis_ sightings only | 197 |           0.0% |           3.0% |          3.0% |       5.5% |                          |
| **Eastern King Bolete**          | 143 |           0.0% |           0.0% |      **0.0%** |       1.6% |                    30.2% |
| **Rocky Mountain King**          | 120 |           0.0% |           0.0% |      **0.0%** |       0.1% |                    97.9% |

Porcini's 216 are 197 _edulis_ plus 19 _chippewaensis_/_subcaerulescens_
sightings. Three of the 19 are hidden. They are county centroids (28.7 km
coordinate uncertainty) in the North Carolina Piedmont, where the host map at
the reported point says nothing about the real site.

### Combined factor at the scoring points

| species             | USE mean | USE < 0.1 | USW mean | USW < 0.1 |
| ------------------- | -------: | --------: | -------: | --------: |
| porcini, `main`     |     0.34 |       59% |     0.42 |       52% |
| porcini, folded     |     0.35 |       58% |     0.42 |       52% |
| Eastern King Bolete |     0.79 |       11% |     0.00 |      100% |
| Rocky Mountain King |     0.00 |      100% |     0.17 |       78% |

66,332 USE and 82,338 USW points, each counted once at the 100° W seam.

### Spot checks (range × host)

| place                        | porcini (`main`) | porcini (folded) | Eastern King | Rocky Mountain King |
| ---------------------------- | ---------------: | ---------------: | -----------: | ------------------: |
| Great Smokies                |             0.02 |             0.20 |         1.00 |                0.00 |
| Central Pennsylvania         |             1.00 |             1.00 |         1.00 |                0.00 |
| Georgia Piedmont             |             0.00 |             0.00 |         1.00 |                0.00 |
| Vermont                      |             1.00 |             1.00 |         0.54 |                0.00 |
| Minnesota Arrowhead          |             1.00 |             1.00 |         0.02 |                0.00 |
| Missouri Ozarks              |             0.00 |             0.00 |         0.98 |                0.00 |
| Kansas                       |             0.02 |             0.02 |         0.11 |                0.00 |
| Colorado San Juans           |             0.97 |             0.98 |         0.00 |                1.00 |
| Colorado Front Range         |             0.99 |             1.00 |         0.00 |                1.00 |
| Arizona White Mtns           |             0.58 |             0.64 |         0.00 |                1.00 |
| New Mexico, Sangre de Cristo |             0.86 |             0.89 |         0.00 |                1.00 |
| Olympics                     |             1.00 |             1.00 |         0.00 |                0.00 |
| Sierra Nevada                |             1.00 |             1.00 |         0.00 |                0.00 |

The Missouri Ozarks value for the Eastern King is real: GBIF has 9 Missouri
records and iNaturalist 16 in the Ozarks.

### Host lists

The host maps are not built from GBIF, so every year's sightings can test a
host list without leaking into the range prior. These use sightings whose
coordinates are within 1 km.

**Eastern King Bolete** (696 sightings):

| hosts                                                                      | hidden | USW points < 0.1 (held-out build) |
| -------------------------------------------------------------------------- | -----: | --------------------------------: |
| oak–hickory, oak–pine, maple–beech–birch                                   |   1.7% |                             99.6% |
| **+ oak–gum–cypress, loblolly–shortleaf and longleaf–slash pine** (chosen) |   1.3% |                             99.6% |
| + aspen–birch, white–red–jack pine                                         |   0.0% |                             89.1% |

The chosen list is the smooth chanterelle's, which grows in the same oak woods.
The nine sightings it misses are in northern Michigan. Adding aspen–birch would
catch them but opens Rocky Mountain aspen to an eastern species, where the
range prior alone reads 0.65–0.86, so it stays out.

**Rocky Mountain King** (528 sightings):

| hosts                                                   | hidden (all years) | hidden (2026) | USW points < 0.1 |
| ------------------------------------------------------- | -----------------: | ------------: | ---------------: |
| spruce–fir, fir–spruce–mountain hemlock                 |               6.2% |          9.2% |            89.8% |
| + aspen–birch, Douglas-fir                              |               3.4% |          5.8% |            84.9% |
| **+ aspen–birch, Douglas-fir, ponderosa pine** (chosen) |               0.4% |          0.0% |            77.5% |

Without ponderosa pine, Arizona's mixed-conifer sightings (mapped as ponderosa
stands) and the Black Hills are hidden. Adding lodgepole pine changes nothing.

**Porcini keeps its US host list.** The folded species hide 28% of their
all-years records under it, but 39 of those 40 are one site near
Charlottesville, Virginia. Adding oak–pine would recover it and 0.7% would
remain, but it lifts porcini's mean factor in the Carolinas Piedmont from
0.06 to 0.72 and in Georgia–Alabama from 0.01 to 0.27, undoing what #269's
host layer was for. The Eastern King now covers that ground.

### iNaturalist cross-check

Research-grade and needs-ID observations, counted by `taxon_id`:

| taxon (iNat id)               | Southern Rockies | Arizona | Pacific states | Appalachians + Northeast | Southeast coastal plain |
| ----------------------------- | ---------------: | ------: | -------------: | -----------------------: | ----------------------: |
| _B. rubriceps_ (499696)       |            1,401 |     298 |              0 |                        1 |                       0 |
| _B. separans_ (350217)        |                0 |       0 |              0 |                    1,894 |                      52 |
| _B. variipes_ (194218)        |                0 |       0 |              1 |                    1,139 |                      75 |
| _B. nobilis_ (500013)         |                0 |       0 |              0 |                      294 |                       0 |
| _B. atkinsonii_ (350203)      |                0 |       0 |              0 |                       69 |                       6 |
| _B. chippewaensis_ (543052)   |                0 |       0 |              0 |                    1,372 |                       0 |
| _B. subcaerulescens_ (194181) |                0 |       0 |              0 |                       90 |                       0 |
| _B. edulis_ (48701)           |               71 |       2 |          6,176 |                    1,656 |                       1 |

iNaturalist files _X. separans_ as _Boletus separans_.

## Scoring parameters

Each species starts from its closest sibling and moves the parameters that the
weather at real 2026 sightings contradicts. That weather is the production
regional parquet (`USW_weather_data.parquet`, `USE_weather_data.parquet`) at
the base point nearest each held-out sighting (median distance 0.025°). The
inputs below are the ones the model reads: lag-weighted air temperature and
humidity, 21-day rain, elevation and soil pH.

| at the sightings (p25 / p50 / p75) | Rocky Mountain King (120) | Eastern King Bolete (141) |
| ---------------------------------- | ------------------------: | ------------------------: |
| temperature, lag-weighted (°C)     |        16.7 / 18.5 / 21.8 |        23.6 / 24.9 / 25.8 |
| humidity, lag-weighted (%)         |        39.0 / 45.1 / 51.1 |        70.4 / 73.6 / 77.1 |
| rain over 21 days (mm)             |        28.8 / 43.2 / 71.1 |       64.2 / 85.4 / 125.4 |
| elevation (m)                      |     2,743 / 2,803 / 3,372 |            98 / 260 / 400 |
| soil pH                            |           5.6 / 6.1 / 6.2 |           5.0 / 5.3 / 5.5 |

Candidates were then scored with the production `calculate_mushroom_score` on
the weather alone (no range, host or season terms). "Temporal AUC" asks whether
a sighting's day outscores the other in-season days at the same point, the
daily signal that is the product. "Spatial AUC" compares sighting points with
400 random points of the region on the same days.

**`rocky_king` — _Boletus rubriceps_, Rocky Mountain King.** It is _edulis_'s
sister species, so it starts from `mushroom`. What the sightings contradict is
the humidity and the altitude: the monsoon arrives as afternoon storms over
dry air, and median humidity at the sightings is 45%. Porcini's saturation
point of 80 would score them at about 0.1 on humidity.

| parameters (Jul–Sep)                                  | mean at sightings | temporal AUC | spatial AUC |
| ----------------------------------------------------- | ----------------: | -----------: | ----------: |
| porcini's, as-is                                      |              5.58 |        0.570 |       0.807 |
| textbook: 13 °C, humidity 70, altitude 3,000          |              5.80 |        0.453 |       0.915 |
| **19 °C, humidity 50, altitude 2,900 ± 900** (chosen) |          **7.51** |    **0.642** |   **0.923** |

**`eastern_king` — Eastern King Bolete.** The ecological match is the summer
bolete (_B. reticulatus_), Europe's early broadleaf porcino, but the eastern
US summer is hotter and more humid than any European one.

| parameters (Jun–Oct)                                         | mean at sightings | temporal AUC | spatial AUC |
| ------------------------------------------------------------ | ----------------: | -----------: | ----------: |
| porcini's (USE), as-is                                       |              6.82 |        0.465 |       0.654 |
| summer bolete's, as-is                                       |              7.74 |        0.505 |       0.674 |
| smooth chanterelle's (same oak woods)                        |              8.45 |        0.643 |       0.761 |
| **24 °C, humidity 75, altitude 400 ± 900, rain 40** (chosen) |          **9.12** |    **0.714** |   **0.823** |

**How the optimum temperature was chosen.** For both species, temporal AUC keeps
rising with the temperature optimum: 0.57 → 0.68 from 17 to 21 °C for
_rubriceps_, 0.68 → 0.75 from 23 to 26 °C for the Eastern King. The warmer
optimum is standing in for the season, favouring July and August over the
cooler edges of the window. The season gate already does that job, so the
optimum sits at the sighting median instead, where the mean score at sightings
peaks (19 and 24 °C). The Eastern King's spatial AUC peaks there too;
_rubriceps_'s drifts from 0.925 at 17 °C to 0.923 at 19 °C.

**Rain:** the Eastern King takes the smooth chanterelle's 40 mm (50 mm moved
temporal AUC from 0.714 to 0.703); _rubriceps_ keeps porcini's 35 mm.

**Also calibrated, but not a strong signal:** the pH optimum sits at the
sighting median (6.0 and 5.3). The Eastern King's altitude sigma stays at 900,
so the Appalachian highlands (1,500 m still scores 0.47) keep their
_B. variipes_ even though GBIF sightings cluster in the populated lowlands.

**Inherited unchanged** from the sibling: sigmas for temperature (5) and
humidity (17), `rain_first`, wind sensitivity, and water and sea relevance.
Land cover is porcini's NLCD forest classes (41, 42, 43).

**Fallback season.** `season_months` is the observed window: 95% of Eastern
King records fall in June–September (peak July–August) and 97% of _rubriceps_
records in July–September. The empirical GBIF curves override both after the
next quarterly rebuild.

These numbers come from a single season (2026) and 120–141 sightings; the only
values tuned against them are the optima, which were set to the sighting
medians rather than searched.

## Literature check

The sources agree with every host, altitude and season choice above. The few
places where the sightings, not the literature, decided are listed after each
species.

**_B. rubriceps_:**

- **Arora & Frank 2014**, "_Boletus rubriceps_, a new species of porcini from
  the southwestern USA", _North American Fungi_ 9(6): 1–11,
  [doi:10.2509/naf2014.009.006](https://doi.org/10.2509/naf2014.009.006):
  southern Rocky Mountains and the Southwest, with spruce, pine and sometimes
  fir. Previously reported as _B. edulis_ or _B. pinophilus_.
- **[Forage Colorado](https://www.foragecolorado.com/post/forage-weekly-1-rocky-mountain-red-boletus-rubriceps):**
  - Hosts: mainly Engelmann spruce, sometimes firs and Douglas-fir, less often
    pines.
  - Elevation: from 8,000 ft (about 2,440 m) early in the season up to the
    tree line.
  - Season: fruits with the July monsoon rains into late September or
    October.
  - Flesh does not stain.
  - Look-alikes are _Leccinum_ and _Suillus_, neither dangerous.
- **Agrees with:** the spruce–fir, fir, Douglas-fir and ponderosa hosts, the
  2,900 ± 900 m altitude, the July–September season, and the description.
- **From the sightings only:** aspen–birch. No source names aspen; it is in
  the list because sightings fall in aspen-mapped mixed stands.

**Eastern King Bolete** (MushroomExpert):

- **[_B. variipes_](https://www.mushroomexpert.com/boletus_variipes.html):**
  mycorrhizal with hardwoods, especially oaks; late summer and fall; eastern
  North America. Cap tan to greyish brown, often cracking; pores white to
  yellowish or olive; not bruising.
- **[_B. separans_](https://www.mushroomexpert.com/boletus_separans.html):**
  mycorrhizal with oaks (possibly other hardwoods, rarely conifers); summer and
  fall; east of the Rockies. Cap lilac-brown to liver-red, fading; flesh
  unchanging.
- **[_B. nobilis_](https://www.mushroomexpert.com/boletus_nobilis.html):**
  mycorrhizal with oaks and possibly other hardwoods; summer and fall; the
  Appalachians.
- **[_B. atkinsonii_](https://www.mushroomexpert.com/boletus_atkinsonii.html):**
  mycorrhizal with oaks, beech and other hardwoods; summer and fall; widely
  distributed in eastern North America.

- **Agrees with:** the oak and hardwood hosts, the no-blue-staining and pore
  descriptions, and the eastern range.
- **From the sightings only:**
  - _B. variipes_ is listed as "late summer and fall", but the group's
    sightings peak in July–August. _X. separans_, 60% of the records, fruits
    in "summer and fall". The empirical season curve settles it after the
    rebuild.
  - The southern pine classes are in the host list because oaks grow inside
    pine-mapped stands.

**The porcini fold:**

- **_B. chippewaensis_** is now treated as part of the _B. edulis_ species
  complex ([Wikipedia, _Boletus edulis_](https://en.wikipedia.org/wiki/Boletus_edulis)).
- **_B. subcaerulescens_** grows with pine and spruce in northeastern North
  America (Bessette, Roody & Bessette 2000, _North American Boletes_,
  pp. 161–162).
- **Both** fit porcini's existing northern-conifer hosts.

## Photo identification

`Boletus variipes` and `Boletus rubriceps` join the shipped BioCLIP vocabulary
as catalog labels; before this they were not in it at all, even as tier-2
rows. The other three Eastern King species have no label of their own, so a
photo of one surfaces as _B. variipes_ or as a neighbouring label.

The bolete look-alikes in `src/data/toxic-species.ts` (_Rubroboletus satanas_,
_R. rhodoxanthus_, _Tylopilus felleus_) warn against both new ids through
`BOLETE_IDS`. _Tylopilus felleus_, the bitter bolete, is the look-alike that
matters in eastern oak woods.

**Gap, not introduced here:** the eastern North American toxic boletes
(_Boletus huronensis_, _B. sensibilis_, _B. subvelutipes_) are not in the
vocabulary, for porcini either. Adding them needs test photos to measure, so it
is a follow-up.

### Measured gate result

`--stage verify-shipped`, run against the previous shipped artifacts and then
against the regenerated ones, on the same 1,590 test photos:

|                                       |                  before |                   after | gate              |
| ------------------------------------- | ----------------------: | ----------------------: | ----------------- |
| labels (catalog / toxic / other)      | 2,623 (38 / 65 / 2,520) | 2,625 (40 / 65 / 2,520) | —                 |
| false-edible@1                        |                   1.21% |                   1.36% | ceiling 2% — pass |
| toxic label in top-3 of a toxic photo |                   94.6% |                   93.8% | floor 92% — pass  |
| catalog top-1                         |                   79.1% |                   79.1% | not gated         |
| catalog top-3                         |                   89.1% |                   89.1% | not gated         |

What moved, photo by photo:

- **False-edible, +1 photo of 660.** One _Rubroboletus satanas_ photo now has
  _B. variipes_ first and _R. satanas_ second; before, _R. satanas_ was first.
  The toxic label is still in its three candidates, and _R. satanas_'s entry
  warns against `eastern_king`.
- **Warning availability, −0.8pp: not a lost warning.** Since #266, 30 test
  photos still carry the old genus label `Boletus`. The gate counts them as
  toxic photos, because `Boletus` is no longer a catalog name. All six
  photos that "lost" a warning are among them: porcini photos whose top three
  are now all boletes, such as _B. edulis_, _B. reticulatus_ and _B. variipes_.
  On the 660 genuinely toxic photos, warning availability is **97.6% before
  and after**.
- **Top-1 on the new labels:** 12 photos, 11 of them the genus-`Boletus`
  porcini photos and one the _R. satanas_ photo above.

Worth fixing separately: relabel or drop those 30 genus-`Boletus` test photos,
so the gate's warning figure measures toxic photos only again.

## Illustrations

Both are repainted from the catalog's own bolete illustrations, so they share
the house style and carry no third-party attribution. Loris approved both on
2026-09-27.

- **Eastern King Bolete:** the summer bolete's full-length stem net, with a
  greyish lilac-brown cap for the tan to lilac-brown group (_X. separans_ is the
  lilac one).
- **Rocky Mountain King:** the bronze bolete's pale stem, netted at the top,
  with a brick red-brown cap: _rubriceps_ means "red head". It is browner than
  the pine bolete's wine red, which has a pinkish stem.

## Recipes

Both borrow porcini's recipes through `RECIPE_BASE_SPECIES`, as #266's
siblings do, and are not added to `recipe.species`: route-to-dish treats that
list as ingredients that are all required.

## Rollout

- **Range priors:** the published files record their taxon keys, so the first
  scoring run after merge rebuilds both macros with the folded porcini keys and
  the two new species (about 10–15 minutes).
- **Host cover:** static and already on R2; host lists apply at scoring time.
- **Season curves:** rebuilt on the first run on or after 1 October. Until
  then both new species use `season_months`.
- **Publishing:** `Task_Scheduler/Upload_Scores_GitHub_logic.py` maps
  `eastern_king_score` → "Eastern King Bolete" and `rocky_king_score` →
  "Rocky Mountain King". That folder is not a git repo, so the change is local.

## Considered and left for later

- **Spring King** (_B. rex-veris_, 700 + 232 records), **White King**
  (_B. barrowsii_, 611 + 105) and **Queen Bolete** (_B. regineus_, 390). They
  mostly share _edulis_ ground in California and the Pacific Northwest. What is
  lost is the spring season and the California oak woodlands.
- **Not in the US:** _B. aereus_, _B. pinophilus_ and _B. reticulatus_ (0–4
  records each, likely misidentifications).
