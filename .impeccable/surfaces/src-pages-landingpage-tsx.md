---
version: 1
slug: 'src-pages-landingpage-tsx'
primary_target: 'src/pages/LandingPage.tsx'
related_targets: ['src/pages/LandingPage.module.scss']
---

# Landing: a walk into the wild

Status: implemented; finish-review disposition: ship. The reviewer confirmed its documentation fix resolved; reviewed visuals were unchanged. The user requested realistic imagery, richer feature content and a clearer map while retaining the app's established identity.

## Direction and composition

The original localized `home.headline` leads the split hero: “Explore what grows around you” in English, without a terminal period. The shared Logo, forecast link, introductory copy and primary map Button accompany a rectangular woodland photograph. The established Space Grotesk, Public Sans, green palette and controls remain intact.

A full deep-green forecast section pairs useful copy, regional coverage and its action with a captured topographic map. The map links to `/map` with species `chant`, latitude 46.72, longitude 7.98 and zoom 10.1. Its map action is visible and OpenStreetMap / Mapzen / AWS attribution remains; no preview disclaimer is displayed. Adjacent identification and cooking features each contain a photograph, heading, explanatory copy and link. Identification keeps the existing safety guidance visible. A closing map action completes the page. There is no feature-navigation strip, botanical arch, specimen selector or catalog illustration.

## Local visual extension

Display type runs 56–96px on desktop and 48–72px below 768px. Forecast headings use 40–60px, feature headings 32–48px and the closing heading 40–72px. Introductory and feature copy is 18px, reduced to 16px on mobile; coverage and safety copy is 14px and map attribution is 12px. Headings balance their wrapping with tight tracking. Theme-aware brand text and the existing deep-green/pale-green forecast pairing remain unchanged.

The page has fluid 24–80px gutters and a 112rem maximum width. The forecast stacks below 1024px; its copy retains a two-column layout until 768px. The hero and feature pair stack below 768px. The portrait hero image becomes a 4:3 crop on mobile, feature images remain 4:3, and the map uses a taller mobile crop. There is no page-specific animation. These composition and type choices remain local; global tokens and `.impeccable/design.json` are unchanged.

## Content and image provenance

Home copy uses the common namespace in en, de, es, fr, it and pt. Safety guidance reuses the species namespace. Scoring coverage remains regional and identification remains a suggestion.

Three new photorealistic marketing images were generated with OpenAI image_gen and encoded as WebP quality 75. They provide atmosphere rather than species-identification evidence:

- `public/landing/forest-floor.webp` — 960×1200, woodland hero.
- `public/landing/forest-find.webp` — 768×576, identification feature.
- `public/landing/wild-mushroom-toast.webp` — 768×576, cooking feature.

`public/landing/lakes-map.webp` (1280×860) is an actual Fung.es MapLibre capture of Lake Thun, Lake Brienz and Interlaken, centered at 7.98E, 46.72N, zoom 10.1 with the Golden Chanterelle overlay. Captured 2026-10-12 from the topographic style and `data.fung.es` tiles; no geography or scores were generated or altered. It is encoded as WebP quality 78. Each of these four assets has an adjacent `.webp.json` provenance sidecar; generated-image sidecars retain their prompts. Combined imagery is approximately 467KB.

## Review evidence

Current rendered references are `.impeccable/review/v2-*.png`, with results in `.impeccable/review/results-v2.json`. Eight layouts across six locales reported no overflow, broken images or JavaScript errors. Three axe checks across light/dark desktop/mobile passed. The production build passed; combined unit and Storybook results were 959 passed with five known unrelated failures. The reviewer's sole material fix was this documentation refresh, subsequently scored resolved. The three unused legacy landing map images were removed, reducing total image precaching by approximately 416KB.
