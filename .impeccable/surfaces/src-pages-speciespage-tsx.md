---
version: 1
slug: 'src-pages-speciespage-tsx'
primary_target: 'src/pages/SpeciesPage.tsx'
related_targets: ['src/components/SpeciesSheet.tsx', 'src/lib/seasons.ts']
---

# Species: what's in season, where the year stands

Status: built on `design/season-pages`. The owner chose "In season now first" and asked for a line showing which season it is, which came before and what comes next.

## Scope and mode

Read surface: the forager's reference, opened while planning. Success is knowing what is out there now, what is coming, and opening any species for the full field card: identification, look-alikes, season and recipes. Timing is the headline; the catalog is the reference.

## Direction contract

- THESIS: the catalog ordered by today. Refuses the wall of identical text cards with 80px photos.
- OWN-WORLD: the Trailhead, unchanged. The deep-green band carries the season line. Paper plates use square 512px species photos, the shared ten-pill meter and the compact look-alike tag.
- STORY: the reader sees where the year stands (just ended, now with today's dot, next, later). They see what is in season near them, sorted by today's score, and what comes next, and they open a plate for its sheet.
- FIRST VIEWPORT: the shared header (title, scope, "Use my location"). Below it, the band: the season name at 36–60px, "N species in season · place", and a four-segment season line with the bars on one line and the labels beneath, each segment jumping to its section. Then search and type chips, then "In season now" plates.
- FORM: surface structure #2, "In season now, then the rest", from a seven-structure list, plus the owner's season line; seed key c1a717de.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Content rules

- "Now" means scoring today near the reader or in the region, or in season by the calendar. "Coming next" lists everything the next season holds, including species carrying on from now, with months, not today's meter.
- A species the region's forecast leaves out waits behind a disclosure, "Grows in other regions".
- The sheet lists every look-alike, worst first, with deduplicated checks and any critical note.
- The garlic smell check now belongs only to garlic and ramps look-alikes. Mushroom and umbellifer look-alikes use a general smell-and-compare check.
