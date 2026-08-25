# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: **one person across two moments.**

- **Planning, at home** — a beginner-to-intermediate forager on a larger screen or a couch phone, deciding whether it's worth going out, what might be findable, where, and what they could cook. Calm attention, network available, browsing and learning.
- **Verifying, in the field** — the same person outdoors, one hand on the phone, standing in front of a plant or mushroom, asking "what is this, and is it safe?" Low confidence, glare, gloves-or-cold fingers, possibly no signal.

Both moments are first-class. Neither is a degraded version of the other: the planning surface is not a shrunken field surface, and the field surface is not a stripped planning surface.

## Product Purpose

Fung.es helps people find, identify, and cook wild food — mushrooms, plants, berries, nuts, flowers. It succeeds when a user goes out at a time that was actually worth going out, identifies what they found without guessing, and eats it safely.

## Positioning

Two mechanisms carry the product, and they are the pair no neighboring foraging app combines truthfully:

1. **"Worth foraging now" scoring** — region (`NE`, `SE`, `USE`, `USW`) plus season plus weather/humidity conditions resolve into a per-species answer to "is today worth it, and for what?" Timing intelligence, not a static catalog.
2. **On-device photo identification (BioCLIP 2)** — the model runs in the browser on the user's own device. Nothing is uploaded, no account exists, no server sees the photo, and it keeps working without a network.

Together: _when to go_ and _what you're holding_, both without a server in the loop.

## Operating Context

- **Interactive map** (MapLibre GL + PMTiles, self-hosted on R2) as the primary canvas, with GeoJSON species overlays, category filtering, and geolocation.
- **Species catalog** — 34 entries with scientific names, seasonality, habitat, identification notes, and safety notes.
- **Recipes** — curated wild-food dishes with difficulty, prep/cook times, steps, and preparation warnings.
- **Route-to-dish** — connects a map route to dishes the find could become.
- **Photo ID** — BioCLIP 2 (ONNX, cached client-side) for in-browser identification.
- **Worth-foraging-now** — the scoring surface at `/worth-foraging-now`.
- Supporting routes: species, recipes, data, instructions, settings, support, offline, and legal (impressum, privacy policy, terms).
- Installable PWA with a service worker, cached tiles, and offline map/species/recipe access.

## Capabilities and Constraints

- **Stack (incumbent, not up for redesign):** React 19 + TypeScript, TanStack Router (file-based routes), Zustand stores, Tailwind CSS 4 + SCSS, Vite 6, MapLibre GL + PMTiles, Vite PWA. Vitest + Testing Library for unit, Playwright for e2e, Storybook as the canonical design-system documentation.
- **Internationalization:** 6 locales — en, de, es, fr, it, pt — with localized species, recipe, and UI content. Layouts must survive long German strings.
- **Offline:** service-worker caching covers the map, species data, recipes, and the ID model. This is a real, shipped capability, not merely an enhancement.
- **No accounts, no server-side user data:** identification and scoring run client-side. There is no auth, no user profile, and no uploaded imagery.
- **Scoring coverage is regional:** only four score regions exist today (`NE`, `SE`, `USE`, `USW`). Do not design or write copy implying global coverage.
- **Design-system vocabulary is already settled** in `CONTEXT.md`: five elevation levels (`base`, `raised-subtle`, `raised`, `floating`, `overlay`), opt-in `glass` / `glass-regular` / `glass-clear`, the shared nav surface constant in `src/lib/nav-surface.ts`, relevance-based disclosure, section-adaptive accent, and the Foundations → Atoms → Molecules → Organisms tiers. Use these terms; do not coin parallel ones.

## Brand Commitments

- Name: **Fung.es** (domain `fung.es`); repository `lodist/funges`.
- Dark and light themes, both first-class, with system-preference detection.
- Attribution obligations are real and recorded in `NOTICE.md` (BioCLIP 2, Imageomics Institute, MIT). Credit must remain visible where required.

## Evidence on Hand

- Real content: 34 species entries, the curated recipe collection, and the regional recommendation dataset behind scoring.
- Real technical proof: working offline PWA, self-hosted PMTiles, in-browser ONNX inference.
- Design-system documentation: `CONTEXT.md` glossary, `docs/adr/`, Storybook stories under `src/stories/`.
- **Not on hand — never fabricate:** user counts, download or install numbers, testimonials, press mentions, expert or mycological-society endorsements, accuracy percentages for the ID model, and any claim of coverage outside the four score regions.

## Product Principles

1. **Never let design imply certainty the product doesn't have.** Identification is a suggestion; edibility is never confirmed by the interface. Safety notes and toxic lookalikes stay prominent and unmissable in every treatment, at every breakpoint, in every locale.
2. **Design for two moments, not an average of them.** Optimize the planning surface for orientation and learning, and the field surface for one-handed, sunlit, offline, low-confidence use. Refuse compromises that make both mediocre.
3. **Timing is the headline, the catalog is the reference.** "Is it worth going out?" outranks "here is a list of species."
4. **Client-side is a promise, not an implementation detail.** No design may quietly introduce an account, an upload, or a server round-trip on a core path.
5. **Speak the settled vocabulary.** Elevation, glass, nav-surface, and atomic tiers are already defined; extend the system through those terms rather than inventing new ones per surface.

## Accessibility & Inclusion

- **WCAG 1.4.11 non-text contrast 3:1 and text contrast floors are hard limits**, not guidance — including the dark-mode accent step (`--happy-500`, not `--happy-700`) on `MobileNavbar`, where translucent chrome over a light map otherwise falls to 1.7:1.
- All 6 locales are first-class; nothing may be legible only in English.
- Field use implies outdoor conditions: high ambient light, imprecise touch, one hand. Treat generous touch targets and high-contrast field surfaces as accessibility requirements, not styling preferences.
