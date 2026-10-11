---
version: 1
slug: 'src-pages-landingpage-tsx'
primary_target: 'src/pages/LandingPage.tsx'
related_targets: ['src/pages/LandingPage.module.scss']
---

# Landing: a walk into the wild

Status: implemented; finish-review disposition: ship. The reviewer confirmed the narrow German heading correction resolved. The user requested natural spectacles and a prominent fall-foliage photograph while retaining the app's established identity.

## Direction and composition

The original localized `home.headline` leads the split hero: “Explore what grows around you” in English, without a terminal period. The shared Logo, forecast link, introductory copy and primary map Button accompany a rectangular woodland photograph. The established Space Grotesk, Public Sans, green palette and controls remain intact.

A full deep-green forecast section pairs useful copy, regional coverage and its action with a captured topographic map. The map links to `/map` with species `chant`, latitude 46.72, longitude 7.98 and zoom 10.1. Its map action is visible and OpenStreetMap / Mapzen / AWS attribution remains; no preview disclaimer is displayed. A natural-spectacle section follows with a prominent autumn-forest photograph, explanatory copy and a link to `/map?species=foliage`. Adjacent identification and cooking features each contain a photograph, heading, explanatory copy and link. Identification keeps the existing safety guidance visible. A closing map action completes the page. There is no feature-navigation strip, botanical arch, specimen selector or catalog illustration.

## Local visual extension

Display type runs 56–96px on desktop and 48–72px below 768px. Forecast headings use 40–60px, natural-spectacle headings 40–64px, feature headings 32–48px and the closing heading 40–72px. Introductory, natural-spectacle and feature copy is 18px, reduced to 16px on mobile; coverage and safety copy is 14px and map attribution is 12px. Headings balance their wrapping with tight tracking. Theme-aware brand text and the existing deep-green/pale-green forecast pairing remain unchanged.

The page has fluid 24–80px gutters and a 112rem maximum width. The forecast stacks below 1024px; its copy retains a two-column layout until 768px. The hero, natural-spectacle copy and feature pair stack below 768px. The autumn photograph uses a 16:7 desktop crop and a 4:5 mobile crop. The portrait hero image becomes a 4:3 crop on mobile, feature images remain 4:3, and the map uses a taller mobile crop. There is no page-specific animation. These composition and type choices remain local; global tokens and `.impeccable/design.json` are unchanged.

## Content and image provenance

Home copy uses the common namespace in en, de, es, fr, it and pt. The introduction mentions natural spectacles in all six locales; the original slogan remains without a terminal period. Safety guidance reuses the species namespace. Scoring coverage remains regional and identification remains a suggestion.

Four photorealistic marketing images were generated with OpenAI image_gen and encoded as WebP quality 75. They provide atmosphere rather than species-identification evidence or a current forecast:

- `public/landing/forest-floor.webp` — 960×1200, woodland hero.
- `public/landing/forest-find.webp` — 768×576, identification feature.
- `public/landing/wild-mushroom-toast.webp` — 768×576, cooking feature.
- `public/landing/autumn-forest.webp` — 1280×720, natural spectacles; 261084 bytes, atmospheric autumn woodland rather than a specific location.

`public/landing/lakes-map.webp` (1280×860) is an actual Fung.es MapLibre capture of Lake Thun, Lake Brienz and Interlaken, centered at 7.98E, 46.72N, zoom 10.1 with the Golden Chanterelle overlay. Captured 2026-10-12 from the topographic style and `data.fung.es` tiles; no geography or scores were generated or altered. It is encoded as WebP quality 78. Each of these five assets has an adjacent `.webp.json` provenance sidecar; generated-image sidecars retain their prompts. Combined imagery is approximately 728KB.

## Review evidence

The previous version's references are `.impeccable/review/v2-*.png`, with results in `.impeccable/review/results-v2.json`. Eight layouts across six locales reported no overflow, broken images or JavaScript errors. Three axe checks across light/dark desktop/mobile passed. The production build passed; combined unit and Storybook results were 959 passed with five known unrelated failures. Its documentation fix was scored resolved and the reviewer returned ship. Three unused legacy landing map images were removed in that version.

Validation of the natural-spectacle addition is recorded in `.impeccable/review/v3-*.png`, `results-v3.json` and build/test/lint logs marked `-v3`. English desktop at 1440px, English mobile at 390px and German dark mode at 320px had no broken images or axe violations. German heading clipping was corrected with `minmax(0, 1fr)`, `overflow-wrap: anywhere` and the localized heading “Schauspiele der Natur”; the visual reviewer marked the correction resolved and returned ship. The build passed; tests recorded 959 passes, five known baseline failures and one todo. Full lint reported 45,188 pre-existing CRLF issues; targeted ESLint and changed-file Prettier checks passed.
