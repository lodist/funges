---
version: 1
slug: 'src-pages-recipespage-tsx'
primary_target: 'src/pages/RecipesPage.tsx'
related_targets: []
---

# Recipes: cook what's in season

Status: built on `design/season-pages`. The owner chose "Cook what's in season".

## Scope and mode

Operate surface: choosing something to cook, at home, often after a walk. Success is opening a recipe whose wild ingredient is out there now, or knowing when another one comes back.

## Direction contract

- THESIS: recipes ordered by whether their wild ingredient is in season today. Refuses the uniform grid of text cards and the filter dialog.
- OWN-WORLD: the Trailhead, unchanged. The deep-green band carries the best recipe as a split hero. Dish photos lead every card (768px squares, 4:3 crops), and the ingredient line shows the species photo plus the shared meter.
- STORY: the reader sees the best recipe for today with its ingredient's conditions, scans the rest of "Ready to cook now", and finds the others under "Later in the year" with the months their ingredient returns.
- FIRST VIEWPORT: the shared header (title, scope, "Use my location"), then search with type chips, then "Ready to cook now" over the band hero: the dish photo (6/11) beside a 30–48px title, time, difficulty, servings, the in-season species with its meter, up to five ingredients, "View recipe" and "Find it on the map".
- FORM: surface structure #2, "Cook what's in season", from a seven-structure list; seed key 35bc8f03.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Content rules

- A recipe is ready when any of its species, or a split-off sibling that cooks like it (the four chanterelles, the porcini group), scores today. Offline, the calendar decides.
- "Later in the year" orders by when the ingredient comes back: next season first.
- The recipe dialog is unchanged.
