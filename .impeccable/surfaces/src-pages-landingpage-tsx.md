---
version: 1
slug: 'src-pages-landingpage-tsx'
primary_target: 'src/pages/LandingPage.tsx'
related_targets: ['src/pages/LandingPage.module.scss']
---

# Landing: colour blocks

Status: rebuilt 17 Oct 2026 after Loris asked for a front page that "hits way harder", pointing at CD Baby, Border Buddy and Blue Forest Farms. Two softer attempts were rejected: a full-bleed photo fading into green ("the fading is ugly … clean lines is a strong point") and a split card ("looks like the original landing page a bit changed").

## Direction and composition

The page is a stack of solid full-bleed colour blocks, one message each, with hard edges and no gradients, fades or overlays:

1. **Forest green (`--happy-900`), the hero.** The header sits on it, with `--logo` turned cream. `home.headline` is uppercase Space Grotesk 700 up to 96px. Under it, the live line `home.live.line` names the mushroom strong (score 7+) in the most half-degree areas of the visitor's continent in tonight's `worth_foraging_now.json`. Without a mushroom in 10+ areas it names the strongest species of any kind, and while loading or when nothing is up it falls back to `home.description`. The continent comes from the time zone. A still light-green dot marks the line as data. Three choices follow: Explore the map (primary), then Browse recipes and See the data (band outline); identification lives in the walk below. The porcino photograph, rounded, hangs on a hard edge from the hero into the next block.
2. **Sand (`--sand`, a hue-90 straw) with forest-green type, the forecast.** The `home.forecast` heading is uppercase, with its body, its action and the coverage line in `--happy-700`. The map capture was removed: at that zoom it read as blurry.
3. **Bright green (`--happy-500`) with forest-green type, the walk.** The heading `home.journey.heading` sits above a vertical timeline whose nodes are rings. Natural spectacles, identification and cooking alternate photo and words, and on phones the line moves to the left edge. The spectacles step follows the season: `seasonalSpectacle` (lib/bloom.ts) picks, among the spectacles built on the visitor's continent, the one in its months nearest its middle, or else the next to start. Its link reads "On now: <name>" or "Coming next: <name>" and opens that layer on the map. Foliage shows the beech-road photograph; each other spectacle has its own, `public/landing/spectacle-<code>.webp` (768×576), kept out of the service-worker precache because only one shows per season. The identification safety notice keeps IdentifyPanel's permanent-notice look.
4. **Forest green, the close.** `home.closing` is uppercase, followed by its action and the Help links. On phones the block runs under the nav bar.

An open-data block naming the sources was tried and rejected for the front page; its sand and green combination now carries the forecast. All blocks keep the same colours in dark mode.

## Content and image provenance

Home copy uses the common namespace in en, de, es, fr, it and pt; legal link labels reuse the sidebar namespace. Every string is one sentence without a terminal period; a second clause follows a comma, colon or dash, never a capital after a semicolon. French uses _vous_ and Portuguese the formal third person, matching each locale's headline. Spectacle names match the map's layer names. The safety line mirrors `species:safetyWarning` without its full stops, and in German names mushrooms as well as wild plants. Scoring coverage remains regional and identification remains a suggestion.

The landing images provide atmosphere rather than species-identification evidence or a current forecast:

- `public/landing/astra-porcini.webp` — 960×1200, generated with OpenAI image generation from the user's photographic references; porcino in woodland soil and leaf litter.
- `public/landing/lingonberries-pine-forest.webp` — 768×576, Pexels (erik-karits, 28338525; free licence, no credit required); low-angle lingonberries in a sunny pine forest.
- `public/landing/wild-mushroom-toast.webp` — 768×576, generated; chanterelle bruschetta for the cooking feature.
- `public/landing/spectacle-cherry_blossom.webp`, `spectacle-bluebell.webp`, `spectacle-heather.webp`, `spectacle-superbloom.webp` — 768×576, Pexels (Sevda Ozdemir 14978029, Jocelyn Erskine-Kellie 8355200, Jasmijn van der Maaten 9481033, Cassi Glisper 12902499; free licence, no credit required), chosen by Loris on 17 Oct 2026 from options he collected. The picks are a town cherry avenue (the layer is towns), a spring bluebell wood, a heath path, and Walker Canyon California poppies (the layer's *Eschscholzia*). A Namaqualand option was set aside because the superbloom layer is US West only. Crops are recorded in their `landing-assets/` JSON.
- `public/landing/autumn-beech-road.webp` — 1280×720, Pexels (fabio-photo, 34490278; free licence, no credit required); road through a yellow-orange beech tunnel, symmetric so the phone crop stays centred.
- `public/landing/alps-map.webp` (no longer on the landing; Support uses it) — 1280×528, an actual Fung.es MapLibre capture centered at 10.21E, 47.38N, zoom 8.7 with the Pine Bolete overlay, captured 2026-10-12 from the original olive `funges_style.json` style and `data.fung.es` tiles with the app's day-zero missing-score fallback; no geography or scores were generated or altered.

Images are WebP at quality 75 (the trail and the map at 78). Each has a provenance record, with the generation prompt where there was one, in `landing-assets/` beside this brief; they live outside `public/` so the deploy does not ship them.
