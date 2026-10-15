---
version: 1
slug: 'src-pages-landingpage-tsx'
primary_target: 'src/pages/LandingPage.tsx'
related_targets: ['src/pages/LandingPage.module.scss']
---

# Landing: a walk into the wild

Status: implemented and polished for merge. A candid porcino find in woodland leaf litter leads the hero, a northern lingonberry patch illustrates identification and a chanterelle bruschetta illustrates cooking. The Alps map preview and its link use pine bolete. Natural spectacles, the prominent fall-foliage photograph and the app's established identity remain intact.

## Direction and composition

The original localized `home.headline` leads the split hero: “Explore what grows around you” in English, without a terminal period. The shared Logo, in-season link, introductory copy and primary map Button accompany a rectangular woodland photograph. The established Space Grotesk, Public Sans, green palette and controls remain intact.

A full-bleed deep-green forecast band pairs useful copy, regional coverage and its action with a captured map of Lake Constance, Liechtenstein and Innsbruck in the app's original olive style. The map links to `/map` with species `pine_bolete`, latitude 47.38, longitude 10.21 and zoom 8.7. Its map action is visible and OpenStreetMap / Mapzen / AWS attribution remains; no preview disclaimer is displayed. A natural-spectacle section follows with a prominent autumn-forest photograph, explanatory copy and a link to `/map?species=foliage`. Adjacent identification and cooking features each contain a photograph, heading, explanatory copy and link. Identification keeps its safety guidance in IdentifyPanel's permanent-notice treatment. A closing map action and the sidebar's Help links (Support, Legal Notice, Privacy Policy, Terms of Use) complete the page, which has no sidebar of its own. There is no feature-navigation strip, botanical arch, specimen selector or catalog illustration.

## Local visual extension

Display type runs 56–96px on desktop and 48–72px below 768px. Forecast headings use 40–60px, natural-spectacle headings 40–64px, feature headings 32–48px and the closing heading 40–72px. Introductory, natural-spectacle and feature copy is 18px, reduced to 16px on mobile; coverage, safety and help-link copy is 14px and map attribution is 12px. Headings balance their wrapping with tight tracking. Theme-aware brand text and the existing deep-green/pale-green forecast pairing remain unchanged; inside the band the focus ring is `--happy-100`.

Sections are full-bleed with fluid 24–80px gutters; past 112rem the gutter grows so content keeps a 112rem page. The forecast stacks below 1024px; its copy retains a two-column layout until 768px. The hero, natural-spectacle copy and feature pair stack below 768px, and the header drops its in-season link there because the mobile nav bar carries it. The hero photograph keeps its 4:5 (capped to the first screen) and becomes a 4:3 crop on mobile; the autumn photograph uses a 16:7 desktop crop and a 4:5 mobile crop; feature images remain 4:3; the map is 1280:528 and becomes 1280:860 on mobile. There is no page-specific animation. These composition and type choices remain local; global tokens and `.impeccable/design.json` are unchanged.

## Content and image provenance

Home copy uses the common namespace in en, de, es, fr, it and pt; legal link labels reuse the sidebar namespace. Every string is one sentence without a terminal period; a second clause follows a comma, colon or dash, never a capital after a semicolon. French uses _vous_ and Portuguese the formal third person, matching each locale's headline. Spectacle names match the map's layer names. The safety line mirrors `species:safetyWarning` without its full stops, and in German names mushrooms as well as wild plants. Scoring coverage remains regional and identification remains a suggestion.

The landing images provide atmosphere rather than species-identification evidence or a current forecast:

- `public/landing/astra-porcini.webp` — 960×1200, generated with OpenAI image generation from the user's photographic references; porcino in woodland soil and leaf litter.
- `public/landing/astra-lingonberries.webp` — 768×576, generated the same way; northern lingonberry patch beside a pine trunk.
- `public/landing/wild-mushroom-toast.webp` — 768×576, generated; chanterelle bruschetta for the cooking feature.
- `public/landing/autumn-beech-road.webp` — 1280×720, Pexels (fabio-photo, 34490278; free licence, no credit required); road through a yellow-orange beech tunnel, symmetric so the phone crop stays centred.
- `public/landing/alps-map.webp` — 1280×528, an actual Fung.es MapLibre capture centered at 10.21E, 47.38N, zoom 8.7 with the Pine Bolete overlay, captured 2026-10-12 from the original olive `funges_style.json` style and `data.fung.es` tiles with the app's day-zero missing-score fallback; no geography or scores were generated or altered.

Images are WebP at quality 75 (the trail and the map at 78). Each has a provenance record, with the generation prompt where there was one, in `landing-assets/` beside this brief; they live outside `public/` so the deploy does not ship them.
