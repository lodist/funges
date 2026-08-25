---
name: Fung.es
description: A foraging map PWA whose interface floats over living terrain — warm paper, one living green, glass chrome. Two hue angles only: 150 for colour, 90 for neutrals.
colors:
  chlorophyll-mist: 'oklch(0.97 0.03 150)'
  chlorophyll-tint: 'oklch(0.93 0.06 150)'
  chlorophyll-soft: 'oklch(0.85 0.12 150)'
  chlorophyll-bright: 'oklch(0.74 0.17 150)'
  chlorophyll-pressed: 'oklch(0.65 0.18 150)'
  chlorophyll-readable: 'oklch(0.42 0.122 150)'
  chlorophyll-deep: 'oklch(0.24 0.07 150)'
  brand-text-dark: 'oklch(0.72 0.15 150)'
  moss-fill: 'oklch(0.9582 0.0193 150)'
  moss-text: 'oklch(0.5 0.1294 150)'
  lichen: 'oklch(0.6731 0.1624 150)'
  field-paper: 'oklch(0.9938 0.0013 90)'
  warm-linen: 'oklch(0.952 0.0083 90)'
  trail-tan: 'oklch(0.9356 0.0194 90)'
  bark: 'oklch(0.4506 0.0552 90)'
  ink: 'oklch(0.2431 0.0076 90)'
  stone: 'oklch(0.5261 0.0151 90)'
  hairline: 'oklch(0.9071 0.01 90)'
  night-canvas: 'oklch(0.2683 0.0279 90)'
  night-surface: 'oklch(0.3327 0.0271 90)'
  category-mushroom: 'oklch(0.3 0.086 150)'
  category-berry: 'oklch(0.37 0.111 150)'
  category-plant: 'oklch(0.44 0.127 150)'
  category-flower: 'oklch(0.51 0.143 150)'
  category-nut: 'oklch(0.58 0.161 150)'
  status-success: 'oklch(0.42 0.122 150)'
  status-info: 'oklch(0.42 0.122 150)'
  warning-fill: '#fa733d'
  warning-text: '#800020'
  warning-border: '#fb4646'
typography:
  display:
    fontFamily: "'Space Grotesk', sans-serif"
    fontSize: '2.25rem'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: '0em'
  headline:
    fontFamily: "'Space Grotesk', sans-serif"
    fontSize: '1.875rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0em'
  title:
    fontFamily: "'Space Grotesk', sans-serif"
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '0em'
  body:
    fontFamily: "'Public Sans', sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0em'
  label:
    fontFamily: "'Public Sans', sans-serif"
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: '0em'
  micro:
    fontFamily: "'Public Sans', sans-serif"
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: '0em'
rounded:
  sm: '0.25rem'
  md: '0.375rem'
  lg: '0.5rem'
  xl: '0.75rem'
  card: '1.25rem'
  pill: '9999px'
spacing:
  unit: '0.25rem'
  xs: '0.5rem'
  sm: '0.75rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2rem'
components:
  button-primary:
    backgroundColor: '{colors.chlorophyll-bright}'
    textColor: '{colors.chlorophyll-deep}'
    rounded: '{rounded.pill}'
    padding: '0 1.5rem'
    height: '2.75rem'
    typography: '{typography.body}'
  button-primary-hover:
    backgroundColor: 'oklch(0.58 0.18 150)'
  button-destructive:
    backgroundColor: '{colors.chlorophyll-deep}'
    textColor: '#ffffff'
    rounded: '{rounded.pill}'
    padding: '0 1.5rem'
    height: '2.75rem'
  button-destructive-hover:
    backgroundColor: 'oklch(0.36 0.10 150)'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.chlorophyll-readable}'
    rounded: '{rounded.pill}'
    padding: '0 1.5rem'
    height: '2.75rem'
  button-ghost-hover:
    backgroundColor: '{colors.chlorophyll-mist}'
    textColor: '{colors.chlorophyll-readable}'
  button-outline:
    backgroundColor: 'transparent'
    textColor: '{colors.chlorophyll-readable}'
    rounded: '{rounded.pill}'
    padding: '0 1.5rem'
    height: '2.75rem'
  button-outline-hover:
    backgroundColor: '{colors.chlorophyll-mist}'
  input-field:
    backgroundColor: '{colors.field-paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '0.25rem 1rem'
    height: '3rem'
    typography: '{typography.body}'
  badge-default:
    backgroundColor: '{colors.chlorophyll-bright}'
    textColor: '{colors.chlorophyll-deep}'
    rounded: '{rounded.pill}'
    padding: '0.125rem 0.5rem'
    typography: '{typography.micro}'
  badge-secondary:
    backgroundColor: '{colors.moss-fill}'
    textColor: '{colors.moss-text}'
    rounded: '{rounded.pill}'
    padding: '0.125rem 0.5rem'
  card:
    backgroundColor: '{colors.field-paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '0'
---

# Design System: Fung.es

## Overview

**Creative North Star: "The Trailhead"**

The Trailhead is the moment before you set off: the signpost is green, the ground is warm, and everything you need to read is legible in full daylight. That moment sets every decision in this system. The map is the world — a living, unpredictable, edge-to-edge surface the interface has no control over — and every piece of chrome is something that floats above it: a signpost, a marker, a field card. The interface never competes with the terrain; it hovers over it and stays readable against whatever the terrain happens to be doing underneath.

The mood is fresh, alive, and tactile. A single spring-green hue does all the signalling, and it is a green with actual chroma in it — `oklch(0.74 0.17 150)`, the color of new growth rather than corporate forest. Everything interactive is a soft-edged pill with a diffuse drop shadow and no border, so surfaces read as pressable objects sitting on warm paper rather than as boxes drawn onto a page. Warm neutrals carry the ground (`#fdfdfc` paper, `#f1efe9` linen, `#f2e8dc` tan): there is no cool grey anywhere in either theme, and the absence is deliberate — cool grey is what makes an outdoor tool feel like an admin panel.

Restraint is enforced in exactly one place and it is the sharpest rule in the system: **two hue angles, and only two.** Hue 150 for everything chromatic, hue 90 for every neutral. No red, not even for destructive actions; no blue for links or info; no separate green for success; no hue-coded categories. Severity is depth on the green scale, never a change of hue. The multi-hue semantic palette — a green for success, a red for danger, a blue for info — is the one thing this system rejects outright, and the rejection is now enforced rather than described: all 22 Tailwind color families are disabled in `@theme`, and `src/test/palette.test.ts` fails the build the moment a third hue angle appears in the theme.

The single sanctioned exception is the map's score ramp, the yellow-through-burgundy scale that paints the polygons. It is its own family because a heat scale cannot be a single hue, and safety warnings borrow from it rather than introducing anything new.

**Key Characteristics:**

- Two hue angles total: 150 for all colour, 90 for all neutrals, plus the map ramp.
- Warm-neutral ground in both themes; zero cool grey, enforced at build time.
- Borderless, full-round, shadow-lifted interactive surfaces.
- Five semantic elevation roles, chosen by meaning rather than by shadow value.
- Glass as an opt-in material on small chrome only — never on the map, never on a dialog.
- Contrast floors treated as hard limits, because the surface underneath is a photograph of the world.

## Colors

Two hue families and nothing else: one spring-green hue carrying every signal, one warm angle carrying every neutral. Every chromatic token in the theme sits at **hue 150**; every neutral sits at **hue 90**. That is the whole palette geometry, and `src/test/palette.test.ts` fails the build if a third angle appears.

The map's score ramp is the single sanctioned exception, and safety warnings borrow from it rather than adding a family of their own.

### Primary

- **Spring Chlorophyll Bright** (`--happy-500`, `oklch(0.74 0.17 150)`): the go-signal. Solid fills on primary buttons and default badges, always paired with Chlorophyll Deep text rather than white. Deliberately never a text color on paper — it measures 2.12:1 there.
- **Spring Chlorophyll Pressed** (`--happy-600`, aliased as `--primary`): the canonical brand value every custom component inherits through `bg-primary` / `text-primary` / `border-primary`. One step down from Bright so pressed states read as settling, not brightening. Not a text color and not the focus ring — at 2.95:1 on paper it misses even the 3:1 non-text floor.
- **Spring Chlorophyll Readable** (`--happy-700`, `oklch(0.42 0.122 150)`, aliased as `--ring` and `--sidebar-ring`): the only green permitted as text or icon color on light surfaces, at 7.73:1, and the focus-ring color for the same reason.
- **Spring Chlorophyll Deep** (`--happy-900`, aliased as `--destructive` and `--primary-foreground`): text on bright green fills, and the stand-in for danger. Destroying something is the deepest green in the system, never red — in **both** themes.
- **Spring Chlorophyll Mist / Tint / Soft** (`--happy-50` / `--happy-100` / `--happy-300`): wash states. Mist is ghost-button hover; Tint is the sidebar's hover/active nav background; Soft is available for large low-emphasis fills.
- **Brand Text** (`--primary-text`): the theme-aware, text-safe brand color — `--happy-700` in light, `oklch(0.72 0.15 150)` in dark. Links, green icons, and both non-warning status tokens resolve here. It exists because `--primary` cannot carry text, and its absence is what sent every link to Tailwind `blue-600`.

### Secondary

- **Moss Fill** (`--secondary`) with **Moss Text** (`--secondary-foreground`): the quieter green pairing, 4.63:1. Secondary badges and low-emphasis chips. Light tint plus dark text, never a solid mid-green fill with white text.
- **Lichen** (dark `--primary`, dark `--sidebar-primary`): the dark theme's brand green, lighter and less saturated because a vivid green cannot hold contrast against the dark ground. A fill and an indicator, not a text color — dark-mode text uses `--primary-text`.

### Tertiary

- **Trail Tan** (`--accent`) with **Bark** (`--accent-foreground`): the warm-neutral accent pairing at hue 90, used where a surface needs to feel like material rather than UI. A light tint with dark text by deliberate choice — a solid warm fill reaches only 3.53:1 with white text. In dark mode it is a dark warm tint with light text at 9.22:1, not the solid mid-green it used to be at 3.47:1.

### Neutral

Every neutral sits at hue 90 in both themes. There used to be ten different angles here.

- **Field Paper** (`--background`, `--card`, `--popover`): the light theme's ground and every card surface. Warm off-white, never `#fff`.
- **Warm Linen** (`--muted`): muted fills and inactive tracks.
- **Ink** (`--foreground`): all body and heading text on light surfaces, 16:1.
- **Stone** (`--muted-foreground`): secondary and tertiary text. The `.text-secondary` and `.text-tertiary` utilities both resolve here — the tertiary step is nominal, not a distinct value.
- **Hairline** (`--border`, `--input`): dividers and the few borders that survive. Most components have none.
- **Night Canvas** (dark `--background`, dark `--sidebar`) and **Night Surface** (dark `--card`, `--muted`, `--popover`): the dark theme's two grounds — warm at hue 90 like their light counterparts, not the green-cast values they used to carry.

### Categories

Species categories are the one place a palette usually reaches for five hues. Here they are five steps of the one hue, each at roughly 95% of the in-gamut chroma for its lightness so the steps sit as far apart as hue 150 allows: `--category-mushroom` (12.09:1 on paper), `--category-berry` (9.80), `--category-plant` (7.23), `--category-flower` (5.10), `--category-nut` (3.78). `--chart-1` … `--chart-5` alias the same five, so charts and map markers cannot drift apart again.

Values live in `src/index.css`; `src/lib/categoryColor.ts` is the only way to read them. Use `categoryVar()` wherever CSS resolves, and `categoryColor()` only for APIs that need a literal — maplibre's `Marker({ color })` writes into an SVG fill attribute and cannot take a `var()`.

### Status

- **Success** and **Info** (`--status-success`, `--status-info`) both resolve to `--primary-text`. They are not their own hues. The `#4cba73` and `#3b82f6` they used to hold were a fifth green family and a blue measuring 3.61:1 as text.
- **Safety warning** (`--status-warning` plus its `-background` / `-text` / `-border`) is drawn from the map score ramp: stop 6 as the fill, stop 10 as the light-theme text, stop 5 as the dark-theme text, stop 8 as the edge. A toxic-lookalike warning has to shout, and borrowing the ramp lets it shout without adding a hue. `src/test/palette.test.ts` asserts these stay literal ramp stops.

### Named Rules

**The Two-Family Rule.** Hue 150 for everything chromatic, hue 90 for everything neutral. The map score ramp is the only other hue family in the product, and safety warnings are its only appearance off the map. A third angle in `src/index.css` fails `src/test/palette.test.ts`.

**The One Hue Rule.** Severity is depth, not hue. `--destructive` is the deepest green in both themes; there is no red anywhere, no blue for info, no separate green for success, and no hue-coded categories.

**The Text-Safe Step Rule.** Colors split into text-safe and fill-only, and this is a contrast fact rather than a style preference. Text-safe: `--primary-text` / `--happy-700`, Moss Text, Ink, Stone, `--status-warning-text`. Fill-only, held to the 3:1 non-text floor: `--happy-500`, `--happy-600` / `--primary`, `--status-warning`, Lichen. Putting 14px text on `--status-warning` yields 3.91:1 at best — callouts use `--status-warning-background`, where the same text reads 10.21:1.

**The No-Default-Palette Rule.** All 22 Tailwind color families are set to `initial` in the `@theme` block, so `text-gray-700` and `bg-blue-50` emit nothing at all. This is deliberate — 453 of them had accumulated, 294 of those cool grey. A color utility that renders nothing means you reached for a family this system does not have; use a token.

**The Warm Ground Rule.** No cool grey, in either theme. A `#f5f5f5`, a `slate-100`, or a pure `#fff` background is out of system. Pure white survives in exactly two places: translucent white washes over media, and the QR code, which needs literal `#000`/`#fff` to scan.

**The Registered-Token Rule.** The brand scale ships as real utilities (`bg-happy-50`, `text-happy-700`), not as `[var(--happy-N)]` arbitrary values. Add new tokens to the `@theme` block in `src/index.css` — that is the live theme, and `tailwind.config.js` carries none.

**The Light-Tuned Scale Rule.** The `--happy-*` steps are absolute: they do not change between themes, and their contrast figures are measured against Field Paper. Anything that needs to work in both themes reads a semantic token instead — `--primary`, `--primary-text`, `--destructive`, `--secondary` — every one of which has a dark-mode value. Reach for a literal `--happy-*` step only where a component genuinely needs two steps of the scale at once, such as a button's fill against its own label.

## Typography

**Display Font:** Space Grotesk (with `sans-serif` fallback)
**Body Font:** Public Sans (with `sans-serif` fallback)
**Reference Serif:** Merriweather — declared as `--font-serif`, reserved
**Mono Font:** Source Code Pro — declared as `--font-mono`, reserved

All four ship locally via `@fontsource` packages imported in `src/main.tsx`; nothing is fetched from a font CDN, which is what lets typography survive the offline path intact.

**Character:** Space Grotesk brings a slightly geometric, outdoorsy confidence to headings — wide apertures, a little quirk in the letterforms, nothing precious. Public Sans underneath it is plain, highly legible at small sizes, and unshowy, which is exactly right for a species name being read at arm's length in bad light. The pairing reads as "field signage plus field notes."

### Hierarchy

- **Display** (Space Grotesk, 600, 2.25rem/36px, ~1.1): page-level hero headings. Rare — reserved for a route's single opening statement.
- **Headline** (Space Grotesk, 600, 1.875rem/30px, ~1.2): route titles and major section openers.
- **Title** (Space Grotesk, 600, 1.25rem/20px, ~1.3): the workhorse heading, and the most common heading size in the app by a wide margin. Card titles, panel headers, species names. `CardTitle` renders at `font-semibold` with `leading-none`, deliberately tight so a title can sit directly above metadata.
- **Body** (Public Sans, 400, 1rem/16px, 1.5): all running text. The global baseline set on `:root`.
- **Label** (Public Sans, 500, 0.875rem/14px): buttons, form labels, list metadata, and input text at `md:` and above.
- **Micro** (Public Sans, 500, 0.75rem/12px): badges and dense map chrome. The floor — nothing smaller ships.

### Named Rules

**The Two-Family Rule.** `h1`–`h3` are Space Grotesk automatically, via a global base rule. Everything else is Public Sans. Never set a display face on body copy, and never override a heading's family to match its surroundings.

**The German Test.** Every text container must survive its longest German string without clipping or reflowing its layout. Six locales ship; a label that only fits in English is broken. Test with `de` before considering a text-bearing component done.

**The Reserved Faces Rule.** Merriweather and Source Code Pro are declared but unused. Introducing either is a design decision that needs a reason — long-form reading matter for the serif, data or coordinates for the mono — not a default reach for variety.

## Layout

The map is the layout. `body` is a locked flex column at `100dvh` with `overflow: hidden` and a `320px` minimum width: the app does not scroll as a document, so every scrolling region is an explicit panel inside a fixed shell. Everything else is chrome positioned against the viewport edges.

The spacing system is a 4px base unit (`--spacing: 0.25rem`) consumed as multiples, with the practical rhythm landing on 8 / 12 / 16 / 24 / 32px. Card interiors use `px-6` (24px) horizontal padding; button interiors use `px-6` with a `px-4` reduction when an icon is present, so an icon plus label doesn't read as over-padded.

Fixed chrome dimensions are tokenized rather than repeated: desktop rail `80px`, header `50px`, footer `40px`, mobile bottom nav `70px` at `≤768px` via `--mobile-navbar-height`, with a `.mobile-navbar-spacing` utility that pads content clear of it. Breakpoints are Tailwind's defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536), and `768px` is the real platform seam: the desktop sidebar rail and the mobile bottom bar swap there.

Touch targets sit at 44px (`h-11`) for buttons and 48px (`h-12`) for the search field — sized for a thumb in the cold, not for a mouse.

**The Fixed Shell Rule.** The app shell never scrolls. If content overflows, it gets its own scroll container; adding scroll to `body` breaks the map canvas.

## Elevation & Depth

Depth in this system is structural and role-first. There are five named elevation roles, and you choose the role that describes what a surface _is_ — the shadow value is a consequence, never a choice. The scale is `base` → `raised-subtle` → `raised` → `floating` → `overlay`, and the definitions are load-bearing: `raised` means small static chrome, `floating` means dismiss-by-tap-outside, `overlay` means blocking-with-a-scrim. The mobile bottom nav visually hovers over the map but is `raised`, not `floating`, because it is persistent primary nav — the taxonomy follows behavior, not appearance.

In light mode the roles are diffuse black drop shadows. In dark mode the geometry is identical (same offsets, same blur, so it stays recognizably one scale) but the alpha deepens and a 1px inset white highlight becomes the primary depth cue, because a 6–24% black shadow is invisible against Night Canvas. Per ADR 0001 these are _not_ aliases of the `--shadow-*` scale, which is weaker and predates the current look; the `--elevation-*` tokens are the single source of truth and `--shadow-*` is legacy.

Glass is a separate, opt-in _material_ layered on top of a role — never a replacement for one. It is restricted to small, fixed-size, not-text-heavy chrome at `raised` or `floating`.

### Shadow Vocabulary

- **Raised Subtle** (`box-shadow: 0 1px 6px rgba(0,0,0,0.06)`): lightweight input chrome you look through rather than press — the search field, a select trigger. No hover escalation.
- **Raised** (`0 2px 16px rgba(0,0,0,0.10)`): small static chrome that sits above the map without floating free of it — cards, the app sidebar, the mobile nav bar.
- **Raised Hover** (`0 6px 20px rgba(0,0,0,0.14)`): the escalation for interactive `raised` surfaces, applied via `.elevation-interactive` on hover and released on `:active`.
- **Floating** (`0 4px 20px rgba(0,0,0,0.16)`): dropdown menus, select content, sheets, tooltips.
- **Overlay** (`0 8px 32px rgba(0,0,0,0.24)`): modal dialogs, which also carry a scrim.
- **Glass Regular** (`backdrop-filter: blur(12px)` over a 90%-opaque paper background): chrome sitting over the map or over text — the nav surfaces, floating map info cards.
- **Glass Clear** (`blur(16px)` over a 12% wash): reserved for full-bleed media backgrounds. Never over text.

### Named Rules

**The Role-Not-Value Rule.** Apply `.elevation-raised`, not a `shadow-[…]` arbitrary value. A hand-rolled shadow on a new component is drift, and it will not track the dark-theme inset highlight.

**The Base-Has-No-Shadow Rule.** The map canvas is `base`: no class, no shadow, no glass. It is not a discrete surface and deliberately has no utility to reach for.

**The Glass Scope Rule.** Glass goes only on small, fixed-size, non-text-heavy `raised` or `floating` chrome. Never on `base` (the map), never on `overlay` (dialogs are text-heavy and contrast-critical over an unpredictable background), and never on anything that animates its own size.

**The Opaque-First Rule.** Every glass surface defines its opaque background first and layers translucency on top inside `@supports (backdrop-filter: blur(1px))`. `prefers-reduced-transparency: reduce` and `prefers-contrast: more` both drop back to opaque. An unsupporting browser must never render near-invisible chrome over a photograph.

## Shapes

The form language is pills and generously rounded rectangles, almost entirely without borders. Everything interactive and small is fully round: buttons, the search field, badges, chips. Containers are softly rounded — cards at `1.25rem` (20px), a deliberately larger radius than the `0.5rem` base `--radius`, which gives them a photo-first, physical-object quality. The radius scale (`sm` 4px / `md` 6px / `lg` 8px / `xl` 12px) derives from `--radius: 0.5rem` and covers the remaining structural surfaces.

Borders are the exception rather than the rule. The redesigned primitives are borderless by design and use shadow to separate themselves from the ground; the only visible strokes belong to the two outline button variants, whose 2px Chlorophyll Pressed edge exists precisely because a bordered affordance inside a borderless system reads as deliberately different. Glass surfaces carry a 1px translucent white border with a brighter top edge, standing in for the specular highlight the material implies.

**The Pill-Or-Card Rule.** Interactive and small → fully round. Container → 20px. There is no middle radius for a component to invent; if a new surface is neither, decide which of the two it is behaving as.

**The Borderless Default Rule.** New components get no border. Separation comes from elevation and background contrast. The outline button pair is the sanctioned exception, and it stays a pair.

## Components

The character line for every primitive: **soft, pressable, borderless.** Depth does the work an outline used to do.

### Buttons

- **Shape:** fully round pill (`border-radius: 9999px`), no border. Default height 44px (`h-11`), large 40px with wider padding, small 32px with `px-3`, icon-only a 44px circle.
- **Primary:** Chlorophyll Bright fill with Chlorophyll Deep text — green on deep green, not green on white. `0 1.5rem` padding, reduced to `1rem` when the label carries an icon, with a `0 2px 8px rgba(0,0,0,0.18)` shadow that reads as a physical lift rather than an outline.
- **Hover / Focus:** background steps down to `oklch(0.58 0.18 150)` and the shadow deepens to `0 3px 12px rgba(0,0,0,0.22)`. No transform, no scale — the surface gets heavier, it doesn't move. Focus rings use `--ring` (Chlorophyll Pressed).
- **Destructive:** identical geometry, Chlorophyll Deep fill with white text, hovering to `oklch(0.36 0.10 150)`. A delete button in this system is the darkest green on screen.
- **Ghost:** transparent with Chlorophyll Readable text, washing to Chlorophyll Mist on hover.
- **Outline:** the sanctioned bordered exception — a 2px Chlorophyll Pressed stroke on transparent, Chlorophyll Readable label, no shadow, washing to Chlorophyll Mist on hover. Its sibling `enhanced-outline` carries the same stroke on white with a `shadow-md` that inverts to a solid Chlorophyll Pressed fill with white text on hover. These two are the whole bordered vocabulary; don't add a third.

### Chips

- **Style:** fully round, borderless, `0.125rem 0.5rem` padding, 12px medium text, 12px inline SVG icons.
- **State:** default is a Chlorophyll Bright fill with Chlorophyll Deep text (note: the literal `--happy-500`, one step brighter than `--primary`, so a badge reads as a marker rather than a small button). Secondary is the Moss tint pairing. Destructive is Chlorophyll Deep with white text. Outline is text-only with an accent hover.

### Cards / Containers

- **Corner Style:** 20px (`1.25rem`) — the photo-first trail card.
- **Background:** Field Paper on light, Night Surface on dark.
- **Shadow Strategy:** `raised` at rest, escalating to raised-hover on hover with a `transition-shadow`. Photo-bearing cards clip their media with `overflow: hidden` at the card radius.
- **Border:** none.
- **Internal Padding:** the card itself has zero padding so media can go full-bleed; the header and content regions supply `px-6` (24px) and a `gap-1.5` (6px) title-to-metadata rhythm.

### Inputs / Fields

- **Style:** 48px-tall (`h-12`) fully round pill on a Field Paper background with a Hairline border and a `raised-subtle` shadow. Base `px-4` padding, with callers that place a leading icon switching to `pl-11` themselves. Text is 16px, tightening to 14px at `md:` and up.
- **Focus:** the border becomes Chlorophyll Bright. No glow, no ring stacking — one border color change, transitioned on `color, box-shadow`.
- **Error:** `aria-invalid` switches the border to `--destructive`, which is Chlorophyll Deep. An error in this system reads as a darkening, not a reddening.

### Navigation

- **Style:** both nav surfaces are elevation `raised` with Glass Regular, and both consume one shared constant (`NAV_SURFACE_CLASS` in `src/lib/nav-surface.ts`) so desktop and mobile chrome cannot drift apart. On the shadcn `Sidebar` the treatment must land on the painted surface (`data-slot='sidebar-inner'`), not the positioning container `className` targets — otherwise the surface's own background paints over the glass.
- **Typography:** Public Sans label sizes; nav item text stays Ink even when hovered or active.
- **Default / hover / active:** only the background tint changes on hover and active — Chlorophyll Tint (`--sidebar-accent`) behind an unchanged label. The active item additionally carries a section-adaptive accent on its own icon and label, and on mobile a slight scale.
- **Mobile treatment:** the bottom bar is 70px at `≤768px`, and its active tint must use `--happy-500`, not `--happy-700`: over translucent dark chrome above a light map, the darker step falls to 1.7:1 and breaks the WCAG 1.4.11 3:1 floor.
- **Relevance-based disclosure:** items appear based on platform and feature context rather than the full set always rendering.

### Motion

Three durations and one curve, and everything references them: `--duration-fast: 150ms` for elevation hover and press micro-interactions, `--duration-base: 200ms` for default state changes, `--duration-slow: 300ms` for floating and overlay enter/exit, all on `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)`. Non-essential motion is removed outright under `prefers-reduced-motion`, not shortened — the state change still lands, it just arrives instantly.

**The Weight-Not-Movement Rule.** Interaction feedback changes shadow and background. It does not scale, translate, or rotate chrome. The one sanctioned transform is the mobile nav's active-item scale.

## Do's and Don'ts

### Do:

- **Do** pick an elevation role (`.elevation-raised`, `.elevation-floating`) and let the shadow follow. Reach for `.elevation-interactive` when the surface responds to hover.
- **Do** keep every colour in its lane: `--primary-text` and Moss Text for text and icons, `--happy-500` / `--happy-600` / `--status-warning` for fills and indicators only.
- **Do** express severity as depth on the green scale. `--destructive` is the deepest green in both themes and that is correct, not a placeholder.
- **Do** reach for `--primary-text` for any green text or icon, and `--status-warning-background` for any warning callout. Those two tokens cover the cases that used to reach for Tailwind blue and Tailwind amber.
- **Do** read category colour through `src/lib/categoryColor.ts`, and always ship a category colour with its icon and label — five steps of one hue separate less well than five hues did.
- **Do** define the opaque background before the translucent one on any glass surface, and honor `prefers-reduced-transparency` and `prefers-contrast`.
- **Do** consume `NAV_SURFACE_CLASS` for any new nav chrome instead of respelling `elevation-raised glass-regular`.
- **Do** keep interactive targets at 44px or larger (48px for the search field). Field use with cold hands is a real constraint.
- **Do** add tokens to the `@theme` block in `src/index.css` — that is the live theme.
- **Do** use a semantic token (`--primary`, `--primary-text`, `--destructive`, `--secondary`) when a component has to work in both themes; the `--happy-*` steps are absolute and light-tuned.
- **Do** test text-bearing components in German before calling them done.

### Don't:

- **Don't** introduce a third hue angle. No red for destructive, no blue for links or info, no amber of its own, no hue-coded categories. Chromatic is 150, neutral is 90, and `src/test/palette.test.ts` enforces it.
- **Don't** reach for a Tailwind colour utility. `text-gray-700`, `bg-blue-50`, `border-red-500` and the other 20 families emit nothing — if a colour class renders no colour, that is why.
- **Don't** write an arbitrary `shadow-[…]` on a new component. It bypasses the role system and will not pick up the dark-theme inset highlight.
- **Don't** treat `--shadow-*` as the elevation scale. It is legacy, materially weaker than what ships, and aliasing to it regresses the live look (ADR 0001).
- **Don't** put glass on the map canvas, on a dialog, or on anything text-heavy or size-animating.
- **Don't** use `--happy-500`, `--happy-600` / `--primary`, or `--status-warning` as a text color. All three are fill-only, held to the 3:1 non-text floor; `--status-warning` gives 3.91:1 at best, so warning callouts use `--status-warning-background`.
- **Don't** use `--happy-700` for the mobile nav's active tint — 1.7:1 over translucent dark chrome on a light map.
- **Don't** add a cool grey or a pure `#ffffff` to either theme. Every neutral is hue 90. The only surviving pure whites are translucent washes over media and the QR code, which needs literal `#000`/`#fff` to scan.
- **Don't** add a border to a new primitive. The outline button pair (`outline`, `enhanced-outline`) is the system's entire bordered vocabulary.
- **Don't** put theme values in `tailwind.config.js` — it carries no theme and is retained only for the shadcn CLI.
- **Don't** make `body` scroll. The shell is fixed at `100dvh`; give overflowing content its own scroll container.
- **Don't** apply a surface treatment to the `Sidebar`'s positioning container. It must land on `data-slot='sidebar-inner'` or the background paints over it.
