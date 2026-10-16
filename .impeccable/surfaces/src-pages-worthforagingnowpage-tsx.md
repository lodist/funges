---
version: 1
slug: "src-pages-worthforagingnowpage-tsx"
primary_target: "src/pages/WorthForagingNowPage.tsx"
related_targets: ["src/lib/worth-foraging-now.ts"]
---

# Worth Foraging Now: today's picks, photographed

Status: proof of concept on `design/worth-foraging-pop`. Two layouts ship side by side behind a POC switch ("Front page" / "Deck") because the owner was torn between them; the loser and the switch go once one is chosen.

## Scope and mode

Operate surface for the planning moment: at home, deciding whether today is worth going out, for what, where, and what to cook. Success is opening the map at the right spot for the right species. The page must keep every pick's toxic look-alike visible.

## Direction contract

- THESIS: answer "what is worth going out for today" with photographs and a clear lead, instead of three equal text cards. Refuses the same-size card grid and the filler "why this is worth your time" sentences.
- OWN-WORLD: the Trailhead, unchanged. Warm paper, the landing's deep-green band (`--happy-900` with `--happy-50` text, `--ring` re-pointed to `--happy-100`), species photos (512px squares) and dish photos, a ten-step condition meter in one green (depth, never a new hue), pill actions, Space Grotesk species names.
- STORY: the reader sees the best pick big, reads conditions, distance and direction, habitat, when to look, the worst look-alike and what to cook, then opens the map at that point. "Use my location" turns region picks into picks within 100 km.
- FIRST VIEWPORT: header row (title, scope · "Updated today", location button, type chips, layout switch). Front page: a deep-green split hero, photo left (5/11), 48–60px name, meter, facts, look-alike, dish pills and actions right; two runner-up cards and a six-tile strip follow. Deck: the same band holds a scroll-snap row of paper field cards, the next one peeking, with prev/next and "2 of 9" beneath.
- FORM: surface structures #1 "Lead story + bench" and #6 "Specimen deck" from a seven-structure list; seed key 31da0180.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Content rules

- Conditions copy describes conditions (Excellent / Good / Fair), never the scoring internals. The score number stays small beside the label.
- Look-alikes come from `TOXIC_SPECIES`: the first entry of the worst severity. The table has no region field, so a US-only look-alike can name itself on a European pick (known ceiling).
- Directions are eight compass points from the reader to the best grid point, shown only from 2 km out.
- No new rasters: every image is an existing species or recipe asset.

## Open decisions

- Front page or deck (or front page on desktop, deck on phones).
- Species photos are 512px; the hero shows them at about 1.2× on desktop. Larger hero crops would need an exception to the 512px precache rule.
