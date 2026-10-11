---
version: 1
slug: 'src-pages-landingpage-tsx'
primary_target: 'src/pages/LandingPage.tsx'
related_targets: ['src/pages/LandingPage.module.scss']
---

# Landing: field-guide cover

Status: implemented; finish-review disposition: ship. The user delegated artistic direction for a minimalist, striking landing aligned with the existing app. This is a surface extension of The Trailhead, not a replacement identity.

## Direction contract

- THESIS: wild food earns the first impression.
- OWN-WORLD: incumbent paper, chlorophyll, Space Grotesk and pill controls.
- STORY: discover a specimen, check conditions, open the map, cook the find.
- FIRST VIEWPORT: large green headline, botanical plate, visible map CTA.
- FORM: interactive field-guide cover, candidate 3, seed 33b09c0d.

## Implemented composition

Shared Logo and a forecast link lead into the large headline, introductory copy, shared primary Button and an arched botanical plate. Three specimen controls switch the image and localized common/scientific name; selection uses aria-pressed and a polite live region. The feature index leads to forecast, identification and recipes. A deep-green forecast section places regional coverage beside a clearly labeled static map preview. Identification keeps safety guidance visible; a recipe photograph leads into the closing map action.

Space Grotesk and Public Sans remain the typefaces. Display type runs 56–96px on desktop and 52–80px below 768px; section headings run 40–72px. Introductory copy is 18px (16px on mobile); small supporting copy is 14px. Theme-aware brand text stays on the incumbent green ramp. Source-colored paper (#fdfbdf) belongs only to illustration mounts and selectors. Paired columns stack below 768px, the feature index remains three columns, and specimen targets remain 44px. Reduced-motion disables the illustration entrance.

## Content and provenance

Home copy lives in the existing common namespace for en, de, es, fr, it and pt. Species names, safety guidance and recipe titles reuse their established translation namespaces. The map preview is a static illustration of the product, not current forecast data. Coverage remains regional; identification remains a suggestion with safety guidance.

All rasters are existing repository assets reused unchanged. No images were generated or added:

- src/assets/species/chant.webp — initial specimen and selector.
- src/assets/species/blackberry.webp — alternate specimen and selector.
- src/assets/species/nettle.webp — alternate specimen and selector.
- src/assets/species/chicken-of-the-woods.webp — identification illustration.
- src/assets/recipes/chanterelle-herb-tart.webp — recipe photograph.
- public/landing/hero-map.webp — static map preview.

## Review evidence

Rendered references live in .impeccable/review/: desktop.png, desktop-full.png, mobile.png, small.png, tablet.png, german.png and dark.png. results.json reports no overflow or console errors for the six checked viewports/theme/locale combinations. Finish review returned ship with no fixes. The landing-specific type scale, botanical arch and image-matched paper are not global design tokens; global palette and component rules remain in DESIGN.md.
