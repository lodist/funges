# One weather fit per group of mushrooms that answer rain alike

Date: 2026-10-14

Tool: `backend/tools/fit_fruiting.py --groups`. Follows #327 (the warmth-dependent lag).

## Why

Similar mushrooms ran on different weather models. In South Europe, porcini had a linear fit, summer bolete a GBM, and pine and bronze bolete hand-set settings. The hand-set settings answer last week's rain. The finds don't: net of the bracket-fungus placebo, every bolete peaks 14-19 days after rain, Cantharellus chanterelles 2-6 days. The Boletus layer takes the best member at each place, so it followed whichever was hand-set.

## What

`GROUPS` (boletes: porcini, pine, bronze, summer bolete, eastern king, rocky king; Cantharellus: chanterelle, smooth, Pacific). Black chanterelle (Craterellus, 9-19 days) and winter chanterelle (no clear lag) are left out.

For a member no fit or GBM ships, and not held back:

- the group is fitted on all its members' finds, in all regions;
- the member-region is pulled toward the group's answer, as a region is toward its species' (`ALPHA_REGION`); with fewer than 30 strata it takes the group's answer as it is;
- it ships by the fits' rule (better than today's model in more held-out years than chance, p < 0.1, at least 6 years), or, with fewer than 6 test years, all held-out years together: at least 150 finds and a gain whose 95% CI, resampling whole weeks, is above 0.

A member that ships its own fit keeps it. In a prototype on held-out years, the group fit matched a member's own fit wherever the member had data (within 0.003); it helps only where the member is thin.

`--groups` adds the models to an exported `fruiting_fit.json` and leaves its other models as they are.

## Results

Timing, each year held out, against today's model (hand-set):

| Member                  |  Finds | Held-out years better | Pooled gain, 95% CI     | Ships                                |
| ----------------------- | -----: | --------------------- | ----------------------- | ------------------------------------ |
| porcini USW             |  1,634 | 7 of 8 (p 0.035)      | +0.034 [-0.018, +0.076] | yes (8 years: the sign test decides) |
| porcini USE             |    388 | 2 of 3                | +0.058 [+0.013, +0.111] | yes                                  |
| bronze bolete NE        |    185 | -                     | +0.182 [+0.094, +0.267] | yes                                  |
| bronze bolete SE        |    628 | 3 of 4                | +0.073 [+0.026, +0.123] | held back (places)                   |
| pine bolete SE          |    330 | -                     | +0.030, CI from -0.022  | no                                   |
| eastern king USE        |    632 | 3 of 6                | +0.005                  | no                                   |
| rocky king USW          |    509 | 2 of 4                | +0.031, CI from -0.045  | no                                   |
| chanterelle NE          | 18,992 | 8 of 11 (p 0.113)     | +0.006                  | no                                   |
| Pacific chanterelle USW |  1,290 | 6 of 8 (p 0.145)      | +0.015                  | no                                   |

Chanterelle USE (61 finds), USW (6) and smooth chanterelle USW (84) have too few finds.

## Validation (`scripts/qa_fruiting_candidate.py`)

| Member           | (a) Places, all years           | (b) Summer 2026                           | (c) Share at 4+, ERA5 2023-2025 |
| ---------------- | ------------------------------- | ----------------------------------------- | ------------------------------- |
| porcini USE      | 0.590 to 0.643 [+0.006, +0.102] | 0.840 to 0.802 [-0.087, +0.008], 37 finds | Oct 51% to 46%, Nov 6% to 4%    |
| porcini USW      | 0.806 to 0.793 [-0.041, +0.016] | 0.690 to 0.696 [-0.047, +0.056]           | Oct 22% to 25%, Nov 4% to 8%    |
| bronze bolete NE | 0.800 to 0.805 [-0.022, +0.033] | -                                         | Sep 61% to 64%, Oct 16% to 15%  |
| bronze bolete SE | 0.822 to 0.777 [-0.083, -0.005] | -                                         | Oct 66% to 72%, Nov 21% to 32%  |

Bronze bolete SE times its finds better but ranks Italian places worse, so it stays hand-set (`HELD_BACK`), and the Italian Boletus layer keeps following it. (c) reads raw ERA5 humidity in the hand-set parts: compare before with after, not with production's levels.
