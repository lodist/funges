# Visual identity research: palette, typography, logo direction

**Date:** 2026-08-21
**Status:** Research for review
**Branch:** `research/visual-identity-202`
**Ticket:** #202 — feeds #203 (Color palette & typography redesign) and #204 (Logo redesign)

Survey of how comparable outdoors/nature/data apps handle palette, type, and
logo, plus concrete directions grounded in the stack already in place: Radix
Colors (shadcn "new-york" + OKLCH tokens in `src/index.css`), Fontsource
(self-hosted Google Fonts, currently Montserrat/Merriweather/Source Code Pro),
and WCAG 2.1/2.2. Not a decision — a menu for #203/#204.

## Reference landscape

### Leading trail app

The closest direct comp: a data-over-map, trust-driven outdoors app. Its
own [brand style guide PDF](https://assets-global.website-files.com/650d0d523ce1729e6e4e0626/650d47c95f79fc1f3665097c_AllTrails%20Style%20Guide.pdf)
is published (binary; not machine-extractable here, but its existence and file
name confirm a maintained system) and the current [product homepage](https://www.alltrails.com/)
identifies a registered mountain-motif mark — an
icon+wordmark combination built around a mountain/peak motif over a map. Its
[logo history](https://1000logos.net/alltrails-logo/) has stayed in the green
family across three redesigns (2010–2017, 2017–2023, 2023–present), each pass
simplifying the mark rather than changing hue — evidence that a single
recognizable green anchor, refined for legibility, outlasts palette
experimentation. Its [2018 media kit](https://cdn-assets.alltrails.com/advertising/AllTrails_Media_Kit_2018.pdf)
and the [Working Not Working case study](https://workingnotworking.com/projects/335389-alltrails-rebrand-and-ui-design)
(secondary, design-agency writeup) describe the 2023 rebrand as UI-system-first:
a defined type scale and componentized map/photo overlays, not just a new logo.
**Fit:** highest — same category (nature/data over a map), same trust
requirement (people plan real trips off the data), same need for a mark that
reads at favicon size and holds up printed on gear.

### Strava

Strava's [2021 brand guidelines deck](https://www.deck.gallery/strava-brand-guidelines-2021/slide/31-primary-and-supporting-colors-defines/)
(secondary re-host of the internal deck, but reproduces the primary-source
color/type specs) defines **Strava Orange** as the primary color with a
supporting neutral set (Pumpkin, Rust, Coal, Gravel, Fog, Icicle), and
**Maison Neue** (Grilli Type) as the brand typeface; current UI work has since
moved toward **Boathouse** (a Grilli Type display face) for marketing alongside
Maison Neue in-product, per [sensatype.com's 2026 type audit](https://sensatype.com/what-font-does-strava-use-in-2026)
(secondary, but font-identification-focused). Strava's [developer brand
guidelines](https://developers.strava.com/guidelines/) — a primary source —
specify the orange-or-underline link treatment as the minimum brand signal for
partner integrations. **Fit:** partial. Strava's palette is saturated/energetic
(performance, competition) rather than earthy — good reference for a
high-contrast accent color, wrong reference for the "outdoorsy-but-scientific"
base palette a foraging app needs. A single confident accent hue (their
orange) used sparingly against a calm neutral base is the transferable lesson,
not the hue itself.

### Gaia GPS

[Nick Botner's portfolio case study](https://www.alphateck.com/project/gaia-identity)
(designer's own primary account) describes the Gaia GPS icon as "the deep,
rich green palette of a mountain pine forest with bright green accents of
freshly budding evergreen needles," built on granite-rock neutrals, with
seasonal palette variants (summer red, fall orange/yellow, winter icy blue) for
the app icon and a 24×24px angular icon set matching the mark's geometry. No
hex values are published in this source. **Fit:** strong on palette
philosophy — "one evergreen anchor + seasonal/rock neutrals" is a clean model
for a foraging app, where the map background is already green-dominant and the
brand mark needs a hue family that won't fight the map fills.

### Komoot

Per Komoot's own [September 2025 product-roadmap press release](https://www.businesswire.com/news/home/20250915468295/en/Komoot-Unveils-Modern-Design-as-Part-of-Ambitious-Product-Roadmap)
(primary, company-issued), the 2025 refresh "introduces a refreshed color
palette, fonts, icons, and illustrations" and shifts to a **photo-forward**
layout prioritizing route imagery over UI chrome, validated with the user
community (80%+ preferred the new design in testing). No hex/type specifics
are published in the release. **Fit:** the photo-forward lesson transfers
directly — this app's species-ID flow is also photo-driven (`SpeciesPage`,
`IdentifyResults`), so whatever palette ships needs to read well as UI chrome
_around_ user/reference photos, not compete with them.

### iNaturalist

The [iNaturalist Community Forum brand-refresh thread](https://forum.inaturalist.org/t/inaturalist-brand-refresh/6984)
quotes the org's own designer directly: the old wordmark used "a modified
version of Optima," the 2019 refresh moved to **Novel Display**, and the bird
mark was redrawn because "the detail in the feathers gets a bit lost at
smaller sizes" and the old mark's uneven weight made it hard to center in app
icons — the exact failure mode a foraging-app mark needs to avoid at favicon
size. The refresh was also driven by consistency across an international
network of independent sites reusing the brand inconsistently — a caution for
any mark this app might later license or federate. **Fit:** highest for the
citizen-science/species-ID angle — same "scientific but approachable, works
as a small icon across many surfaces" brief.

### Merlin Bird ID (Cornell Lab of Ornithology)

Per the [Cornell Lab's own Merlin page](https://www.birds.cornell.edu/home/merlin/)
and reporting on the mark (secondary but attributes the designer directly):
the shared Cornell Lab/Merlin logo is an illustrated bird "reminiscent of the
work of ... Charley Harper," designed by Michael Bierut, explicitly referencing
a specific illustrator's flat-color, geometric wildlife-art style rather than a
generic outdoors abstraction. **Fit:** useful counter-example — an
_illustrative species mark_ (not abstract) is viable for a science-institution
app, but it commits hard to one visual language and doesn't generalize across
21+ species the way an abstract botanical/mycological motif would for this app.

### Pl@ntNet

[plantnet.org](https://plantnet.org/en/) (primary) uses a simple green leaf as
the app icon, the stylized "Pl@ntNet" wordmark (`@` replacing "a," reinforcing
its citizen-science/tech identity), lowercase section headers, and
documentary/field photography (herbarium work, training sessions) rather than
polished lifestyle shots. **Fit:** closest citizen-science comp for palette
restraint — a single leaf glyph, no gradient, no illustration detail — and
validates that a minimal green leaf mark reads fine at app-icon size, which
matters directly for #204.

## Palette directions

All three below are built from published [Radix Colors](https://www.radix-ui.com/colors)
scale values (`radix-ui/colors` package, `src/light.ts` / `src/dark.ts` on
[GitHub](https://github.com/radix-ui/colors)) — the same system the shadcn
"new-york" style expects and directly comparable to the current
`--primary: oklch(0.5084 0.1347 144.1672)` token in `src/index.css`. OKLCH
values below were computed from each scale's published hex via the CSS
Color 4 sRGB→OKLab formula, matching how `src/index.css` already records
tokens (`oklch(...) /* #hex */`).

### A. Forest/Moss + Warm Neutral

Radix `grass` (primary) + `sand`/`brown` (neutral/accent). Closest to the
current app palette and to Gaia GPS/the leading trail app's "single evergreen anchor"
model — lowest migration cost.

| role               | Radix step       | hex                 | OKLCH                                 |
| ------------------ | ---------------- | ------------------- | ------------------------------------- |
| primary (solid)    | `grass9`         | `#46a758`           | `oklch(0.651 0.147 147)`\*            |
| primary text/hover | `grass11`        | `#2a7e3b`           | `oklch(0.526 0.129 147)`\*            |
| accent             | `brown9`         | `#ad7f58`           | earthy tan, for badges/secondary CTAs |
| neutral base       | `sand1`–`sand12` | `#fdfdfc`…`#21201c` | warm off-white → near-black           |

\*computed from the published hex via the sRGB→OKLab formula (CSS Color 4);
not copied from Radix, which ships hex/P3, not OKLCH.

### B. Deep Teal + Terracotta accent

Radix `teal` (primary) + `bronze`/`orange` (accent). More distinct from
generic "hiking-app green," reads more scientific/aquatic-adjacent (useful if
foraging expands to coastal/wetland species), higher contrast headroom than
grass at the same lightness.

| role               | Radix step | hex       | OKLCH                                           |
| ------------------ | ---------- | --------- | ----------------------------------------------- |
| primary (solid)    | `teal9`    | `#12a594` | `oklch(0.649 0.114 182)`\*                      |
| primary text/hover | `teal11`   | `#008573` | `oklch(0.552 0.101 179)`\*                      |
| accent             | `bronze9`  | `#a18072` | terracotta, for warning/highlight chips         |
| accent alt         | `orange9`  | `#f76b15` | high-visibility CTA, Strava-style single accent |

### C. Sage + Charcoal (muted/scientific)

Radix `sage` (primary/neutral hybrid) + `olive`. Lowest chroma of the three —
closest to iNaturalist/Pl@ntNet's restrained, documentary tone; best choice if
the goal is to read as a field guide rather than a fitness/adventure app.

| role                        | Radix step       | hex                   | OKLCH                                                                                                             |
| --------------------------- | ---------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| primary (solid)             | `sage9`          | `#868e8b`             | `oklch(0.639 0.010 172)`\* — low chroma, needs a separate saturated accent for CTAs                               |
| text                        | `sage11`         | `#5f6563`             | `oklch(0.501 0.008 174)`\*                                                                                        |
| accent (from grass or teal) | `grass9`/`teal9` | `#46a758` / `#12a594` | sage alone is too low-contrast/low-energy for primary buttons; pair with A or B's primary for actionable elements |

Direction C is a neutral/text system more than a brand-color system — pair it
with A or B's primary rather than shipping it alone.

## Typography directions

All fonts below are on [Fontsource](https://fontsource.org) (self-hosted
Google Fonts packages, matching how Montserrat/Merriweather/Source Code Pro
already ship) and on [fonts.google.com](https://fonts.google.com), so a swap
is a package-and-token change, not a hosting change.

### 1. Geometric display + humanist body (leading-trail-app/Gaia-adjacent)

**[Space Grotesk](https://fonts.google.com/specimen/Space%2BGrotesk)**
([Fontsource](https://fontsource.org/fonts/space-grotesk)) for
display/headings — geometric grotesk, distinct at large sizes, reads
confident/modern without Strava's aggressiveness — paired with
**[Public Sans](https://fonts.google.com/specimen/Public+Sans)**
([Fontsource](https://fontsource.org/fonts/public-sans)) for body — a
government-grade (18F) humanist sans built for maximal legibility at small
sizes over busy backgrounds, which matters directly for text sitting on top of
map tiles and photo overlays. Closest match to the "trustworthy data app"
register the leading trail app and Gaia occupy.

### 2. Serif display + sans body (field-guide register)

**[Fraunces](https://fontsource.org/fonts/fraunces)** (also on
[fonts.google.com](https://fonts.google.com/specimen/Fraunces)) — a warm,
slightly organic serif with a "soft" optical-size axis — for page titles and
species names, paired with **[Libre Franklin](https://fontsource.org/fonts/libre-franklin)**
([fonts.google.com](https://fonts.google.com/specimen/Libre+Franklin)) for
body/UI. This is the closest pairing to a printed field guide or nature
magazine (a serif accent is explicitly named as an option in the ticket) and
differentiates the app from the geometric-sans sameness of Strava/Komoot/most
fitness apps — but costs more in perceived "techiness"; best if the brand
wants to lean scientific/editorial over outdoorsy-athletic.

### 3. Single humanist sans family (low-risk, current-adjacent)

**[Work Sans](https://fonts.google.com/specimen/Work+Sans)**
([Fontsource](https://fontsource.org/fonts/work-sans)) or
**[DM Sans](https://fontsource.org/fonts/dm-sans)** across both display and
body weights, keeping **Source Code Pro** (already shipped, already on
Fontsource) for the existing mono use. Lowest-risk option: one family, several
weights, smallest bundle delta from the current Montserrat setup, minimal
retraining of existing Tailwind `font-sans` usage. Trades away a distinctive
type personality for consistency and bundle size — reasonable if #203 wants to
ship fast and revisit typography personality separately from the palette.

## Logo directions

Checked against the app's actual mark surfaces: `src/components/Sidebar/AppSidebar.tsx`
(persistent sidebar logo slot), `src/styles/splash-screen.scss` (a ~200px
splash-screen logo container), the browser favicon, and — per this ticket's
brief — the header bar sitting above `MapFallback`/the live map and above
species photos in `SpeciesPage`/`IdentifyResults`. All three directions below
need to survive: (a) favicon-scale reduction, (b) placement over a photo or
map tile with variable contrast, (c) a species range from mushrooms to
berries to flowers (no single-species illustration, unlike Merlin's bird).

### 1. Abstract leaf/spore mark (icon + wordmark)

A simplified, geometric leaf or spore-cluster glyph — closer to Pl@ntNet's
minimal leaf than to Merlin's illustrated bird. Single flat fill, no gradient,
2–3 anchor points max, so it survives to 16×16 favicon. Pair with a wordmark
for the header/sidebar and drop to icon-only for the favicon and splash
screen, matching how the leading trail app's mountain-motif mark and Pl@ntNet both run
icon+wordmark in-product and icon-alone at small sizes. Lowest risk, most
directly comparable to the strongest primary sources found here.

### 2. Monoline botanical icon (line-art mark)

A single-weight outline mark (mushroom cap + stem, or a stylized foraging
basket) in the leading-trail-app/Gaia "solid and angular icon set" spirit — Gaia's own
case study explicitly describes designing a matching 24×24 icon set in the
logo's geometry, which is the reusable lesson here: pick a stroke weight and
corner radius the _entire_ icon system (species categories, map pins, UI
icons — note `SpeciesPage.tsx` already uses `lucide-react`'s `Leaf`/
`MapPin`/`AlertTriangle`) can share, not just the logotype. Needs the most
design iteration but pays off in a coherent system across the sidebar,
category badges, and map markers.

### 3. Lettermark (wordmark-only or monogram)

A custom "F" (or stylized "fun-gi/forage" monogram) with no pictorial glyph —
lowest illustration risk, cheapest to keep legible at every size since there's
no fine detail to lose (the exact problem iNaturalist's old bird mark had per
their own designer's account). Weakest at communicating "nature/foraging" at a
glance without accompanying text, so best paired with a consistently
color-coded background chip (using whichever palette direction from above)
rather than standing alone.

## Accessibility & contrast constraints

Primary source: [WCAG 2.1 Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
— **4.5:1** for normal text, **3:1** for large text (≥18.66px/24px bold or
≥24px/18pt regular). [WCAG 2.1 Understanding SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
— **3:1** against adjacent colors for UI component boundaries/states
(input borders, checkbox/toggle indicators, focus outlines) and graphical
objects required to understand content (icons without text, chart lines/pie
slices) — explicitly **excluding** logos, which "a particular presentation of
graphics is essential" to, and inactive/disabled controls. WCAG 2.2 carries
these same two criteria forward unchanged (verify against the
[WCAG 2.2 criteria list](https://www.w3.org/TR/WCAG22/) if #203 targets 2.2
specifically — no new contrast SC was added, but 2.2 adds SC 2.4.11 Focus Not
Obscured which interacts with the same focus-ring color choice).

**The green problem, concretely.** Mid-tone saturated greens are a known
WCAG-AA failure mode on white, and this codebase has already hit it once: the
comment at `src/index.css:90-91` records that `#2e7d32` (`oklch(0.5234 ...)`)
rendered only **4.26:1** against the sidebar background and had to drop to
`oklch(0.5084 ...)` (`#29782d`, **4.57:1**) to pass. The same failure is
sharper against pure white. Computed directly here via the W3C relative-
luminance formula ([WCAG 2.1 §1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)):

| color                          | vs white (`#ffffff`)                                                                                                                         | vs black (`#000000`) |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Material "green 500" `#4caf50` | **2.78:1 — fails 4.5:1 and even 3:1 large-text**                                                                                             | 7.56:1               |
| Tailwind `green-500` `#22c55e` | **2.28:1 — fails**                                                                                                                           | 9.22:1               |
| Radix `grass9` `#46a758`       | **3.03:1 — fails 4.5:1 body text; barely clears the 3:1 large-text/non-text floor**                                                          | 6.93:1               |
| Radix `grass11` `#2a7e3b`      | **5.07:1 — passes 4.5:1**                                                                                                                    | 4.15:1               |
| current `--primary` `#29782d`  | **5.50:1 vs pure white — passes**; the in-repo comment's 4.57:1 figure is measured against the sidebar's off-white `#f0e9e0`, not pure white | 3.82:1               |

The pattern: Radix's own `9` step (the "solid button fill" step) is tuned for
_non-text_ use (buttons with white text on top, or icons at 3:1) — it is
**not** meant to sit on white as body text. Radix's `11` step is the one
documented for text-on-white. Any of the three palette directions above must
pull text/link colors from step `11` (or deeper), and reserve step `9` for
button/badge fills paired with a light or white foreground — mirroring what
this codebase already does (`--primary-foreground: oklch(1 0 0)` = white text
on the green fill) and already had to correct once by hand.

**OKLCH adjustment guidance for #203:** to take a Radix `9`-step green from
"non-text-safe" to "text-safe" on white, hold hue (`H`) constant and lower
lightness (`L`) until relative luminance drops enough for 4.5:1 — in practice
that's roughly the `9`→`11` step gap Radix already ships (e.g. `grass9`
`oklch(0.651 0.147 147)` → `grass11` `oklch(0.526 0.129 147)`, a ~0.12 drop in
L with a small C pullback). Don't fix contrast by boosting chroma (`C`) —
that makes the failure worse at a given `L`, since chroma pushes relative
luminance the wrong direction for mid-hue greens; fix it by walking down the
scale's `L` (i.e., pick a later step), which is exactly what Radix's 1–12
scale is designed to hand you without hand-tuning.

## Summary for #203 / #204

**#203 — Color palette & typography redesign:**

- Lead with **Direction A (Forest/Moss + Warm Neutral, Radix `grass`+`sand`/`brown`)** — lowest migration cost from the current green-OKLCH system, most aligned with the leading trail app/Gaia's "one evergreen anchor" precedent.
- Keep **Direction B (Deep Teal + Terracotta, `teal`+`bronze`/`orange`)** as the alternate if the team wants more differentiation from generic hiking-app green.
- For any primary-on-white text/link color, pull from Radix step **`11`, not `9`** — `9` is a non-text/button-fill step and will fail 4.5:1 on white (see table above); this repo already had to hand-correct exactly this failure once (`src/index.css:90-91`).
- Typography: **Option 1 (Space Grotesk + Public Sans)** is the safest default — geometric display, small-size-legible body over map/photo backgrounds. **Option 2 (Fraunces + Libre Franklin)** if the brand wants a field-guide/editorial register instead of an athletic-app register.
- Verify all body text and non-text UI elements (borders, focus rings, chart lines) against WCAG **1.4.3 (4.5:1 text / 3:1 large text)** and **1.4.11 (3:1 non-text)** before shipping, in both light and dark tokens (mirror the existing `:root`/`.dark` split in `src/index.css`).

**#204 — Logo redesign:**

- Default to **Direction 1 (abstract leaf/spore icon + wordmark)** — closest precedent (Pl@ntNet, the leading trail app's simplified mark evolution), best favicon survivability, no single-species commitment.
- If the team wants a more distinctive/ownable mark and has budget for a full icon-system pass, **Direction 2 (monoline botanical line-art)** extends into the existing `lucide-react` icon usage (`Leaf`, `MapPin`, `AlertTriangle` in `SpeciesPage.tsx`) for a coherent system, per Gaia GPS's documented approach of designing the icon set alongside the logo.
- Test every candidate mark at three concrete surfaces before picking: the `AppSidebar` icon slot, the `splash-screen.scss` splash container (~200px), and a 16×16 favicon — iNaturalist's own designer cited exactly this failure ("detail... gets a bit lost at smaller sizes") as the reason their old mark needed replacing.
- Logos are exempt from WCAG 1.4.11's 3:1 non-text contrast rule, but the mark should still be legible in the header bar over both light and dark map styles (`AdvancedMap`'s dark-mode style swap) and over variable species-photo backgrounds — pick a version with a solid-fill background chip as a fallback for low-contrast placements.
