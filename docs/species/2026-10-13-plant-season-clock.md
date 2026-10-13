# A warmth clock for the learned plant season

Date: 2026-10-13

Tool: `backend/tools/fit_phenology.py`. Production is unchanged: it reads the weekly grids named in `backend/generated/phenology.json`.

Ships for Europe: blackberry, daisy, elderflower, garlic, rose_hips, strawberry, violets. For the US: elderflower, rose_hips. Live until now: Europe blackberry, elderflower, garlic, rose_hips; the US elderflower, rose_hips.

## What changed

- **The season's clock.** Besides the day of the year, day length, latitude and the place's yearly climate, the model now reads each place's normal temperature on the day and its normal degree-days over 5 C since 1 January (from the ERA5 monthly normals, per 0.25 degree cell). Day of year and latitude alone let a southern spring leak north: violets opened in February at 36-44 N in US East, where the tags show none.
- **Dead months per latitude band.** A month is dead where a plant's stage tags fall under a tenth of their peak in the same region and 4-degree latitude band, in bands with at least 20 stage sightings. Across a whole region, February was dead for violets in US East although it is their peak at 32-36 N, while daisy's January opening at 32-40 N hid in the average. A dead month counts against the learned season only where it opens what today's months keep shut: elderflower at 44-48 N in US West in May reads 0.77, its months 1.0.
- **Per continent.** A plant ships in a continent when it wins the held-out years and opens no dead band-month there: daisy opens January at 32-40 N in US East, so it ships in Europe only.

## Held-out years

AUC of the stage sightings against all plant sightings on each held-out year, averaged; today's factor is the months in production.

| Plant         | Years | Today | Learned before | Learned now | Years won | Dead band-months opened                                                                                            |
| ------------- | ----: | ----: | -------------: | ----------: | --------: | ------------------------------------------------------------------------------------------------------------------ |
| blackberry    |    11 | 0.677 |          0.818 |       0.818 |  11 of 11 |                                                                                                                    |
| blueberry     |    11 | 0.789 |          0.814 |       0.807 |  10 of 11 |                                                                                                                    |
| cloudberry    |     7 | 0.876 |          0.822 |       0.841 |    0 of 7 |                                                                                                                    |
| elderberry    |    11 | 0.788 |          0.871 |       0.872 |  11 of 11 |                                                                                                                    |
| huckleberry   |     8 | 0.805 |          0.739 |       0.750 |    0 of 8 | USW-40N-6 USW-44N-6                                                                                                |
| lingonb       |    10 | 0.823 |          0.815 |       0.780 |   2 of 10 | SE-44N-12                                                                                                          |
| pawpaw        |    11 | 0.697 |          0.775 |       0.775 |  11 of 11 |                                                                                                                    |
| raspberry     |    11 | 0.832 |          0.842 |       0.838 |   8 of 11 | USE-32N-6 USW-32N-10 USW-36N-6 USW-36N-10 USW-36N-11 USW-36N-12                                                    |
| rose_hips     |    11 | 0.705 |          0.800 |       0.803 |  11 of 11 |                                                                                                                    |
| sea_buckthorn |     7 | 0.778 |          0.747 |       0.748 |    1 of 7 | NE-44N-12 NE-60N-1 NE-60N-12                                                                                       |
| sloes         |    10 | 0.714 |          0.816 |       0.815 |  10 of 10 |                                                                                                                    |
| strawberry    |    11 | 0.714 |          0.769 |       0.785 |  11 of 11 |                                                                                                                    |
| chestnut      |     8 | 0.809 |          0.807 |       0.797 |    3 of 8 |                                                                                                                    |
| hazelnut      |    11 | 0.661 |          0.753 |       0.762 |  11 of 11 | NE-60N-2 USW-40N-12                                                                                                |
| walnut        |    10 | 0.629 |          0.743 |       0.737 |  10 of 10 |                                                                                                                    |
| daisy         |    11 | 0.612 |          0.797 |       0.790 |  11 of 11 | USE-32N-1 USE-32N-2 USE-36N-1                                                                                      |
| elderflower   |    11 | 0.728 |          0.854 |       0.854 |  11 of 11 |                                                                                                                    |
| violets       |     9 | 0.814 |          0.905 |       0.908 |    9 of 9 |                                                                                                                    |
| garlic        |     7 | 0.766 |          0.841 |       0.835 |    7 of 7 |                                                                                                                    |
| ramps         |    10 | 0.583 |          0.717 |       0.711 |  10 of 10 |                                                                                                                    |
| nettle        |     9 | 0.502 |          0.655 |       0.665 |    9 of 9 | NE-56N-11 NE-56N-12 SE-44N-2 USE-36N-1 USE-36N-2 USE-36N-11 USE-36N-12 USE-40N-12 USW-36N-12 USW-40N-12 USW-44N-11 |
| sorrel        |     8 | 0.542 |          0.655 |       0.669 |    8 of 8 | NE-52N-1 NE-56N-1 NE-56N-2 NE-56N-7 NE-56N-12 USE-36N-1 USE-44N-1 USE-44N-2 USE-44N-12                             |
| asparagus     |     6 | 0.493 |          0.249 |       0.250 |    0 of 6 | SE-44N-7 SE-44N-8 SE-44N-9                                                                                         |
| artichoke     |     4 | 0.669 |          0.398 |       0.319 |    0 of 4 |                                                                                                                    |

## Held back although they pass

- Elderberry, hazelnut, walnut, pawpaw, sloes: fruiting tags include green fruit. Ramps: its leaf tags count the leafless budding stalks. Sorrel: its winter rosettes peak in December. US blackberry: Kansas and Nebraska read 6-7 in October. (As before.)
- Blueberry: it opens unripe places the sightings do not reach: South Europe's mountains on 25 May (0% to 40% of in-range places at 4+), US East on 20 April (0% to 23%), US West on 12 October (0% to 46%).
- Strawberry and violets in the US: they shut the north while it still fruits and flowers (strawberry 92% to 48% on 25 June, violets 91% to 0% on 25 May in US East). In late spring every plant flowers, the sightings a plant is measured against swell, and an early plant's share drops while it is still there. A measure of how many people are out that does not depend on what flowers is the follow-up.

## On the map

4,000 random places per region on main's stored weather, the blend between regions as in production; share of in-range places (range prior at least 0.5) at 4+, live / this change, and the mean score:

| Plant       | Region | 20 Apr                 | 25 May                  | 25 Jun                  | 20 Aug                | 12 Oct                |
| ----------- | ------ | ---------------------- | ----------------------- | ----------------------- | --------------------- | --------------------- |
| blackberry  | NE     | 0% / 0% (0.0 / 0.0)    | 5% / 1% (0.3 / 0.1)     | 15% / 9% (1.3 / 0.9)    | 89% / 94% (7.2 / 7.4) | 93% / 92% (6.3 / 6.2) |
| blackberry  | SE     | 1% / 1% (0.1 / 0.1)    | 5% / 3% (0.5 / 0.3)     | 77% / 75% (5.9 / 5.9)   | 95% / 95% (7.0 / 7.0) | 76% / 73% (5.1 / 5.0) |
| blackberry  | USE    | 87% / 87% (7.3 / 7.3)  | 100% / 100% (7.9 / 7.9) | 100% / 100% (8.4 / 8.4) | 96% / 96% (7.9 / 7.9) | 1% / 1% (1.2 / 1.2)   |
| blackberry  | USW    | 24% / 24% (2.5 / 2.5)  | 69% / 69% (5.4 / 5.4)   | 77% / 77% (6.3 / 6.3)   | 72% / 72% (5.5 / 5.5) | 61% / 61% (4.5 / 4.5) |
| daisy       | NE     | 97% / 89% (6.8 / 6.3)  | 99% / 99% (7.5 / 7.1)   | 95% / 75% (6.6 / 5.1)   | 0% / 1% (0.8 / 0.4)   | 0% / 24% (1.1 / 2.4)  |
| daisy       | SE     | 97% / 95% (8.6 / 7.9)  | 98% / 67% (7.9 / 5.3)   | 0% / 27% (1.1 / 2.1)    | 0% / 1% (0.5 / 0.4)   | 0% / 43% (0.9 / 3.5)  |
| daisy       | USE    | 92% / 92% (7.5 / 7.5)  | 100% / 100% (8.5 / 8.5) | 100% / 100% (7.6 / 7.6) | 0% / 0% (0.7 / 0.7)   | 0% / 0% (1.1 / 1.1)   |
| daisy       | USW    | 72% / 72% (5.5 / 5.5)  | 58% / 58% (4.7 / 4.7)   | 42% / 42% (3.9 / 3.9)   | 0% / 0% (0.5 / 0.5)   | 0% / 0% (0.5 / 0.5)   |
| elderflower | NE     | 4% / 2% (0.3 / 0.3)    | 46% / 48% (3.3 / 3.6)   | 87% / 87% (6.0 / 5.9)   | 0% / 5% (0.1 / 0.5)   | 0% / 0% (0.0 / 0.0)   |
| elderflower | SE     | 20% / 19% (1.9 / 1.8)  | 86% / 89% (7.0 / 7.3)   | 63% / 61% (4.8 / 4.7)   | 1% / 1% (0.1 / 0.1)   | 0% / 0% (0.0 / 0.0)   |
| elderflower | USE    | 10% / 8% (0.8 / 0.7)   | 56% / 55% (4.7 / 4.5)   | 99% / 99% (7.9 / 7.9)   | 7% / 6% (0.7 / 0.7)   | 6% / 6% (0.6 / 0.6)   |
| elderflower | USW    | 17% / 15% (1.2 / 1.1)  | 52% / 47% (4.1 / 3.7)   | 90% / 90% (6.9 / 6.9)   | 12% / 14% (1.1 / 1.2) | 1% / 1% (0.2 / 0.1)   |
| garlic      | NE     | 77% / 77% (5.9 / 5.9)  | 1% / 38% (0.1 / 2.9)    | 0% / 6% (0.0 / 0.6)     | 0% / 0% (0.0 / 0.0)   | 0% / 0% (0.0 / 0.0)   |
| garlic      | SE     | 72% / 69% (5.0 / 4.8)  | 5% / 7% (0.6 / 0.7)     | 0% / 0% (0.0 / 0.0)     | 0% / 0% (0.0 / 0.0)   | 0% / 0% (0.0 / 0.0)   |
| rose_hips   | NE     | 0% / 0% (0.1 / 0.0)    | 0% / 0% (0.0 / 0.0)     | 2% / 3% (0.5 / 0.4)     | 67% / 69% (5.3 / 5.3) | 96% / 96% (6.8 / 6.8) |
| rose_hips   | SE     | 0% / 0% (0.1 / 0.1)    | 4% / 4% (0.7 / 0.7)     | 22% / 17% (2.3 / 2.1)   | 50% / 52% (4.4 / 4.5) | 93% / 93% (7.6 / 7.6) |
| rose_hips   | USE    | 0% / 0% (0.1 / 0.0)    | 1% / 0% (0.1 / 0.1)     | 7% / 10% (0.9 / 1.0)    | 62% / 50% (4.7 / 4.1) | 97% / 95% (7.2 / 7.0) |
| rose_hips   | USW    | 15% / 17% (1.5 / 1.6)  | 0% / 1% (0.2 / 0.1)     | 7% / 8% (1.1 / 1.1)     | 62% / 59% (4.6 / 4.4) | 90% / 85% (6.0 / 5.7) |
| strawberry  | NE     | 8% / 0% (2.7 / 0.0)    | 99% / 12% (7.2 / 0.9)   | 100% / 98% (8.0 / 7.5)  | 0% / 31% (2.7 / 2.4)  | 0% / 11% (0.8 / 1.3)  |
| strawberry  | SE     | 35% / 11% (3.5 / 1.0)  | 100% / 76% (8.1 / 6.0)  | 85% / 77% (6.8 / 6.1)   | 0% / 1% (1.6 / 0.1)   | 0% / 2% (0.9 / 0.2)   |
| strawberry  | USE    | 51% / 51% (3.5 / 3.5)  | 97% / 97% (7.5 / 7.5)   | 92% / 92% (7.0 / 7.0)   | 0% / 0% (1.9 / 1.9)   | 0% / 0% (0.9 / 0.9)   |
| strawberry  | USW    | 24% / 24% (3.2 / 3.2)  | 96% / 96% (6.5 / 6.5)   | 78% / 78% (5.8 / 5.8)   | 0% / 0% (1.6 / 1.6)   | 0% / 0% (0.8 / 0.8)   |
| violets     | NE     | 99% / 53% (7.0 / 4.0)  | 0% / 0% (1.6 / 0.0)     | 0% / 0% (0.7 / 0.0)     | 0% / 0% (0.6 / 0.0)   | 0% / 0% (1.0 / 0.0)   |
| violets     | SE     | 100% / 24% (7.9 / 1.9) | 0% / 0% (1.6 / 0.0)     | 0% / 0% (0.4 / 0.0)     | 0% / 0% (0.3 / 0.0)   | 0% / 0% (0.8 / 0.0)   |
| violets     | USE    | 79% / 79% (7.6 / 7.6)  | 91% / 91% (8.9 / 8.9)   | 0% / 0% (2.1 / 2.1)     | 0% / 0% (1.1 / 1.1)   | 0% / 0% (1.1 / 1.1)   |
| violets     | USW    | 67% / 67% (5.5 / 5.5)  | 17% / 17% (2.3 / 2.3)   | 0% / 0% (0.8 / 0.8)     | 0% / 0% (0.6 / 0.6)   | 0% / 0% (0.7 / 0.7)   |
