# Fall foliage: a peak-colour forecast

Date: 2026-10-11 (roadmap #272, step 5)

The fifth "spectacle" layer, after [cherry blossom](2026-09-30-cherry-blossom.md), [bluebell woods](2026-10-10-bluebell.md), the [desert superbloom](2026-10-10-desert-superbloom.md) and [heather](2026-10-11-heather.md). It forecasts when the US hardwood forests and the Rocky Mountain aspens reach peak autumn colour. This record is its design and the evidence behind `backend/foliage.py`'s constants.

**The values below are agent-derived and wait on Loris's approval.** They come from iNaturalist records, the PhenoCam network, USA-NPN and NASA POWER temperatures; no forester has reviewed them. `backend/tools/calibrate_foliage.py` reproduces every table (`--grid` for the parameter search).

## The model

Cold degree-days: from **15 August** (`START`, index 45 of a season from 1 July), each day adds how far its mean falls below **33 °C** (`BASE`); the peak is the day the sum reaches **1,031 °C·days** in the east (`REQUIREMENT`), **897** for the aspens west of 102° W (`ASPEN_REQUIREMENT`).

- **33 °C is not a physiological threshold.** At that base nearly every day counts, so the sum is a cooling clock: about 2.5–3 days later per 1 °C warmer. The grid has a flat ridge from (1 August, 36 °C) to (1 September, 27–30 °C), and every sensitivity variant lands on it.
- **A photoperiod term adds nothing:** the day-length variant totals 25.20 against plain cold degree-days' 25.19; Delpierre's model 25.59; a photoperiod start 26.37.
- **Weather adds little over geography:** the model beats one fixed date clearly and a latitude + elevation line a little, and its year-to-year skill is weak. Treat the map as climatology plus a nudge from this year's late summer.

## Data

- **iNaturalist:** research-grade, leaf-annotated records of the colour trees (Acer, Quercus, Betula, Fagus, Populus, Liriodendron, Nyssa, Oxydendrum, Sassafras, Carya, Fraxinus, Hamamelis, Liquidambar, _Cornus florida_), US, August–December 2016–2026, evergreen oaks out: 43,985 records. A record counts as coloured if it carries "Colored Leaves".
- **The observed peak** is the median date of coloured records per POWER cell-year with ≥ 6 of them: 361 eastern cell-years in 200 cells, 270 of them from 2024–25. It falls between PhenoCam's 25%- and 10%-greenness-left days (+2.6 / −3.0 days), so it marks full colour; the 50% crossing of the coloured share runs two weeks earlier and marks onset. Split-half reliability r 0.63; weekends do not shift it.
- **Independent, never fitted on:** PhenoCam, 850 site-years at 123 deciduous broadleaf sites east of 100° W, 2008–2025; USA-NPN Nature's Notebook "Colored leaves", 2,695 site-years.
- **Temperatures:** NASA POWER daily T2M, moved to the records' median ground elevation at 6.5 °C/km.

## Tests

Mean absolute error in days:

| test                                                   |    model | one fixed date | lat + elev line | other                    |
| ------------------------------------------------------ | -------: | -------------: | --------------: | ------------------------ |
| leave one year out, 361 cell-years                     | **7.95** |          10.95 |            8.41 | cell's own median 9.87   |
| fitted elsewhere, tested on New England + New York     | **7.70** |          12.44 |            8.45 |                          |
| fitted on New England + New York, tested elsewhere     | **8.05** |          13.50 |            9.41 |                          |
| PhenoCam 25% left, own requirement, leave one year out |     9.32 |          11.85 |               – | site's own median 6.15   |
| USA-NPN ≥ 50% coloured, own requirement                |    10.31 |          12.73 |               – | site's own median 9.46   |
| aspens, own requirement, leave one year out            | **6.06** |           6.62 |            6.99 | eastern requirement 8.40 |

- **Year to year:** r 0.12 on iNaturalist and 0.31 at PhenoCam.
- **The aspens** come out +4.9 days late on the eastern requirement in every variant (+3 to +9.5), so they get their own; it rests on 26 cell-years from two autumns.
- **WeatherAPI against POWER,** 1 September – 7 October 2026: +0.07 °C at 200 eastern cells (peaks +0.2 days), −0.26 °C at 19 aspen cells (−0.7 days). No correction.

## The forecast

- **Inputs** (`backend/foliage.py`, run by `bloom.build_spectacles` from the USE and USW MapLayer scripts): the master's daily Tmax/Tmin since 1 July, including its 7 forecast days, then the POWER normals to 31 December.
- **Season:** built and shown 1 September – 30 November. Observed peaks run 20 September – 2 December (1st–99th percentile).
- **A normal year must peak by 30 November** (`LATEST_NORMAL_PEAK`): it hides Florida, the Gulf coast, south Texas and the low deserts (4.4% of USE's cells, 1.1% of USW's; 0.5% of the eastern sightings).

## The map

It is drawn on the land the species layers are drawn on. Each US MapLayer script keeps its pieces' land cover (the triangles clipped to the wilderness polygons, with their dominant NLCD class) and hands it to `build_spectacles`:

- **The woods:** pieces of deciduous and mixed forest (NLCD 41, 43). Evergreen (42) would add little (sightings within 300 m 32.9% → 36.5%) and paint the conifers.
- **West of 102° W, only from 1,500 m up** (the cell's mean elevation), the aspen zone; that drops nearly all the Pacific lowland woods.
- **Each piece takes the forecast at its middle** (`bloom._sample`), on the same interpolation the bands use, rather than being cut into bands: the ground is too fine for that (419,000 polygons, 160 MB, on the wilderness polygons).
- **Simplified at 0.01°**, as the species forecast's pieces are, so they look alike; the simplified multi-part pieces are mended with `buffer(0)`, which keeps 96% of the woods' area where dropping invalid ones, as the forecast does, lost three quarters.
- **Sightings:** of the eastern coloured-leaf records, 13.4% lie in a wood, 32.9% within 300 m and 57.9% within 1 km.

## Places looked at

A normal year on production's 0.1° cells:

| place                             | requirement | normal year | published typical peak                    |
| --------------------------------- | ----------- | ----------: | ----------------------------------------- |
| Stowe, VT                         | eastern     |      11 Oct | late Sep – mid Oct; best ~5–13 Oct        |
| North Conway, NH                  | eastern     |      13 Oct | first – second week of Oct (valleys)      |
| Kancamagus Pass, NH               | eastern     |       5 Oct | last week of Sep at the pass              |
| Acadia, ME                        | eastern     |      11 Oct | mid-Oct                                   |
| Berkshires (Lenox), MA            | eastern     |      12 Oct | ~4–15 Oct                                 |
| Adirondacks (Lake Placid), NY     | eastern     |       7 Oct | last days of Sep – early Oct              |
| Blue Ridge Parkway (Blowing Rock) | eastern     |      22 Oct | mid elevations 2nd–3rd week of Oct        |
| Smokies (Newfound Gap)            | eastern     |      20 Oct | above 4,000 ft early – mid Oct            |
| Upper Peninsula (Porcupine Mts)   | eastern     |       8 Oct | last week of Sep – first two weeks of Oct |
| Door County, WI                   | eastern     |      15 Oct | mid-Oct                                   |
| Ozarks (Buffalo River), AR        | eastern     |      31 Oct | late Oct – early Nov                      |
| Maroon Bells, CO                  | aspen       |      20 Sep | 22–30 Sep most reliable                   |
| Kenosha Pass, CO                  | aspen       |      20 Sep | 18–26 Sep                                 |
| Wasatch (Guardsman Pass), UT      | aspen       |      25 Sep | late Sep – early Oct                      |

Thirteen of the sixteen eastern places fall inside their published window; the misses (Kancamagus Pass, Mt Pisgah, Newfound Gap) are high sites whose 0.1° cell averages 650–970 m. All five aspen places fall inside theirs.

## Caveats

- **The target is noisy** and clusters in 2024–25; the year-to-year evidence rests on PhenoCam (r 0.31).
- **Drought browning, an early frost or a windstorm** can end a season early; nothing here sees them.
- **Elevation:** a cell's mean decides, so high overlooks in the southern Appalachians come out 5–10 days late and low valleys in mountain cells early.
- **2026 is not in the fit:** by 10 October only 5 eastern cell-years had ≥ 6 coloured records.

## Rechecks, autumn 2026 and 2027

- **After 30 November 2026:** refetch iNaturalist 2026 and PhenoCam's final 2026 transitions, and test 2026 as a held-out year.
- **The aspen requirement** with 2026's Colorado and Utah records.
- **WeatherAPI against POWER** over a full September – November.
- **The high-elevation lag:** each wood with its own height instead of its cell's mean.

## Sources

1. Go Stowe, Stowe fall foliage: <https://gostowe.com/blog-stowe-fall-foliage-facts>; Visit Vermont, Fall Foliage: <https://www.visit-vermont.com/state/foliage/>
2. Kancamagus Highway, Fall Foliage: <https://kancamagushighway.com/fall-foliage-on-kancamagus-highway-nh-fall-foliage/>
3. NPS Acadia, Weather: <https://www.nps.gov/acad/planyourvisit/weather.htm>
4. Berkshire Eagle (DCR), peak foliage in the Berkshires: <https://www.berkshireeagle.com/news/local/berkshire-pea-fall-foliage/article_91795530-b3ee-4a19-affc-29c04c2d34b9.html>
5. Fall Photo Guide, New York: <https://fallphotoguide.com/foliage/new-york/>; Visit Catskills, Fall: <https://visitcatskills.com/fall/>
6. Blue Ridge Parkway Foundation, Fall Color Guide: <https://www.blueridgeparkway.org/plan-your-parkway-trip/stories-guides/fall-color-on-the-parkway/>
7. NPS Great Smoky Mountains, Fall Colors: <https://www.nps.gov/grsm/planyourvisit/fallcolor.htm>
8. UP Travel, Fall Color Reports: <https://www.uptravel.com/outdoors-recreation/fall-colors/>; Door County Visitor Bureau, Fall: <https://www.doorcounty.com/fall/>
9. Buffalo Outdoor Center, Buffalo River fall colour: <https://www.buffaloriver.com/buffalo-river-fall-color-guide-buffalo-outdoor-center/>
10. Aspen Chamber, Fall Foliage and Maroon Bells: <https://aspenchamber.org/things-to-do/trip-highlights/fall-foliage/>; Explore Park County, Kenosha Pass: <https://exploreparkcounty.com/kenosha-pass-a-kaleidoscope-of-colors-in-colorados-fall-foliage/>; Visit Utah, Leaf Peeping Scenic Byways: <https://www.visitutah.com/articles/leaf-peeping-utah-scenic-byways>
11. Models: Delpierre et al. 2009, Agric. For. Meteorol. 149: 938–948; Jeong & Medvigy 2014, Global Ecol. Biogeogr. 23: 1245–1254.
12. Data: iNaturalist API (v2 observations, v1 controlled terms); NASA POWER daily point API and 1991–2020 climatology; PhenoCam transition dates (<https://phenocam.nau.edu/>); USA-NPN observations API (<https://services.usanpn.org/npn_portal/observations/getObservations.json>); HydroSHEDS 3″ DEM; the app's USE and USW wilderness polygons.
