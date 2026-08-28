---
name: Fung.es
description: A foraging map PWA whose interface floats over living terrain — warm paper, one living green, glass chrome. Two hue angles: 150 for colour, 90 for neutrals, plus hue 28 for danger and the map ramp for warnings.
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
  chlorophyll-hover: 'oklch(0.62 0.17 150)'
  fly-agaric: 'oklch(0.48 0.19 28)'
  fly-agaric-pressed: 'oklch(0.40 0.17 28)'
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
    letterSpacing: '0.06em'
    textTransform: 'uppercase'
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
    backgroundColor: '{colors.chlorophyll-hover}'
  button-destructive:
    backgroundColor: '{colors.fly-agaric}'
    textColor: '#ffffff'
    rounded: '{rounded.pill}'
    padding: '0 1.5rem'
    height: '2.75rem'
  button-destructive-hover:
    backgroundColor: '{colors.fly-agaric-pressed}'
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

Restraint is enforced in exactly one place and it is the sharpest rule in the system: **two hue angles for the palette, plus one for danger, plus the map ramp.** Hue 150 for everything chromatic, hue 90 for every neutral, hue 28 for destructive actions. Warning chrome is the third case and it introduces no hue of its own: it borrows literal stops from the map score ramp, so a warning reads in the same colours as the map the visitor is already looking at. No blue for links or info; no separate green for success; no hue-coded categories. Severity is depth on the green scale, never a change of hue. The multi-hue semantic palette — a green for success, a red for danger, a blue for info — is the one thing this system rejects outright, and the rejection is enforced rather than described: all 22 Tailwind color families are disabled in `@theme`, and `src/test/palette.test.ts` fails the build the moment a fourth hue angle appears in the theme.

Danger is the one place hue does the work, and it took a revision to get there (#225). The original rule admitted no red at all and put `--destructive` on the deepest green step — which meant a delete button was the same hue as a confirm button, and nothing but text told the two apart. Red earns its exception here because it is not a generic UI convention in this domain: red is the foraging world's own "do not eat" signal, the fly agaric's warning. Hue 28 keeps it warm enough to belong to the earth palette rather than reading as a borrowed system red, and it is a single angle used by the `--destructive` tokens alone.

The single sanctioned exception is the map's score ramp, the yellow-through-burgundy scale that paints the polygons. It is its own family because a heat scale cannot be a single hue, and safety warnings borrow from it rather than introducing anything new.

**Key Characteristics:**

- Two hue angles for the palette: 150 for all colour, 90 for all neutrals, plus the map ramp — and hue 28, used by the destructive tokens and nothing else.
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
- **Spring Chlorophyll Deep** (`--happy-900`, aliased as `--primary-foreground`): text on bright green fills. It used to double as `--destructive`; see **Fly Agaric** below for why that changed.
- **Fly Agaric** (`--destructive`, `oklch(0.48 0.19 28)` light / `oklch(0.52 0.18 28)` dark): danger and delete, and the only place hue 28 appears. 7.21:1 against its white label in light and 6.04:1 in dark (5.11:1 against `--destructive-foreground`, which the button does not use), and 3.35:1 against the primary green so a delete can never be mistaken for a confirm. Dark mode also carries `--destructive-border` at 4.80:1, because the fill alone reaches only 2.50:1 against Night Canvas.
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

**The One Hue Rule.** Severity is depth, not hue — with two exceptions, both narrow. `--destructive` is hue 28, the fly agaric's red, and no other token may use it. Warning chrome borrows literal stops from the map score ramp rather than inventing an amber. Everything else is hue 150 over hue 90: no blue for info, no separate green for success, no hue-coded categories. `src/test/palette.test.ts` enforces all of it, including that a coloured token can't slip in as a hex literal.

**The Text-Safe Step Rule.** Colors split into text-safe and fill-only, and this is a contrast fact rather than a style preference. Text-safe: `--primary-text` / `--happy-700`, Moss Text, Ink, Stone, `--status-warning-text`. Fill-only, held to the 3:1 non-text floor: `--happy-500`, `--happy-600` / `--primary`, `--status-warning`, Lichen. Putting 14px text on `--status-warning` yields 3.91:1 at best — callouts use `--status-warning-background`, where the same text reads 10.21:1.

**The No-Default-Palette Rule.** All 22 Tailwind color families are set to `initial` in the `@theme` block, so `text-gray-700` and `bg-blue-50` emit nothing at all. This is deliberate — 453 of them had accumulated, 294 of those cool grey. A color utility that renders nothing means you reached for a family this system does not have; use a token.

**The Warm Ground Rule.** No cool grey, in either theme. A `#f5f5f5`, a `slate-100`, or a pure `#fff` background is out of system. Pure white survives in exactly two places: translucent white washes over media, and the QR code, which needs literal `#000`/`#fff` to scan.

**The Registered-Token Rule.** The brand scale ships as real utilities (`bg-happy-50`, `text-happy-700`), not as `[var(--happy-N)]` arbitrary values. Add new tokens to the `@theme` block in `src/index.css` — that is the live theme, and `tailwind.config.js` carries none. The two filled buttons' pressed steps are tokens for this reason: they shipped as `hover:bg-[oklch(...)]` arbitrary values, which no palette check can see.

**The Light-Tuned Scale Rule.** The `--happy-*` steps are absolute: they do not change between themes, and their contrast figures are measured against Field Paper. Anything that needs to work in both themes reads a semantic token instead — `--primary`, `--primary-text`, `--destructive`, `--secondary` — every one of which has a dark-mode value. Reach for a literal `--happy-*` step only where a component genuinely needs two steps of the scale at once, such as a button's fill against its own label.

## Typography

**Display Font:** Space Grotesk (with `sans-serif` fallback)
**Body Font:** Public Sans (with `sans-serif` fallback)
**Mono Font:** Source Code Pro — `--font-mono`, and it is earned: the feature-flag chip, the QR fallback string, the support-page identifiers.

All three ship locally via `@fontsource` packages imported in `src/main.tsx`; nothing is fetched from a font CDN, which is what lets typography survive the offline path intact.

There is no reference serif. Merriweather held `--font-serif` and rendered on no screen, shipping twenty files and 692 KB to `dist/` — half the font payload — to do it. Both the font and the token went at #225. Three faces is the ceiling, not a coincidence: a fourth has to earn its download on a real screen before it earns a token.

**Character:** Space Grotesk brings a slightly geometric, outdoorsy confidence to headings — wide apertures, a little quirk in the letterforms, nothing precious. Public Sans underneath it is plain, highly legible at small sizes, and unshowy, which is exactly right for a species name being read at arm's length in bad light. The pairing reads as "field signage plus field notes."

### Hierarchy

- **Display** (Space Grotesk, 600, 2.25rem/36px, ~1.1): page-level hero headings. Rare — reserved for a route's single opening statement.
- **Headline** (Space Grotesk, 600, 1.875rem/30px, ~1.2): route titles and major section openers.
- **Title** (Space Grotesk, 600, 1.25rem/20px, ~1.3): the workhorse heading, and the most common heading size in the app by a wide margin. Card titles, panel headers, species names. `CardTitle` renders at `font-semibold` with `leading-none`, deliberately tight so a title can sit directly above metadata.
- **Body** (Public Sans, 400, 1rem/16px, 1.5): all running text. The global baseline set on `:root`.
- **Label** (Public Sans, 500, 0.875rem/14px): buttons, form labels, list metadata, and input text at `md:` and above.
- **Micro** (Public Sans, 500, 0.75rem/12px, `0.06em`, uppercase): badges and dense map chrome — the label above a control, the caption on a stat chip, the section header in a popover. Implemented as `.type-micro` in `globals.scss`, which sets no colour so the caller pairs it with the foreground its surface needs. The floor — nothing smaller ships, and at #225 that stopped being aspirational: eleven sites had been at 10px and 11px because this role had a name here and no implementation in code.

### Named Rules

**The Two-Family Rule.** `h1`–`h3` are Space Grotesk automatically, via a global base rule. Everything else is Public Sans. Never set a display face on body copy, and never override a heading's family to match its surroundings.

**The German Test.** Every text container must survive its longest German string without clipping or reflowing its layout. Six locales ship; a label that only fits in English is broken. Test with `de` before considering a text-bearing component done.

**The Third Face Rule.** Two faces carry the interface and the third is mono, used only where characters have to align by column. A fourth face is a design decision that needs a reason and a screen, not a default reach for variety — and the reason has to arrive before the token does. This rule used to reserve two faces for hypothetical futures; one of them, Merriweather, sat unused long enough to accumulate 692 KB of `dist/` and a comment in `main.tsx` explaining that it existed because its token did.

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

The form language is pills and generously rounded rectangles, almost entirely without borders. Everything interactive and small is fully round: buttons, the search field, badges, chips. Containers are softly rounded at `1.25rem` (20px) — the `--radius-card` token, deliberately larger than the `0.5rem` base `--radius` and deliberately not derived from it, which gives them a photo-first, physical-object quality and keeps them one shape when the structural scale is retuned. The radius scale (`sm` 4px / `md` 6px / `lg` 8px / `xl` 12px) derives from `--radius: 0.5rem` and covers the remaining structural surfaces.

Borders are the exception rather than the rule. The redesigned primitives are borderless by design and use shadow to separate themselves from the ground; the only visible strokes belong to the variants named `outline`, whose Chlorophyll edge exists precisely because a bordered affordance inside a borderless system reads as deliberately different — 2px Chlorophyll Pressed on the two buttons, 1px Chlorophyll Readable on the badge, which is a third the height. Glass surfaces carry a 1px translucent white border with a brighter top edge, standing in for the specular highlight the material implies.

**The Pill-Or-Card Rule.** Interactive and small → `rounded-full`. Container → `rounded-card`. There is no middle radius for a component to invent; if a new surface is neither, decide which of the two it is behaving as. Both roles are tokens precisely so this rule is checkable — `src/test/radius.test.ts` fails on a re-introduced `rounded-2xl` or an invented `rounded-[19px]`. Shape belongs in a component's base, never in a variant or a size: a stray `rounded-*` down there wins via `tailwind-merge`, which is how three button variants spent #225 as 6px rectangles nobody chose. The one sanctioned exception is `tooltip.tsx`'s arrow, a 10px square rotated 45° that is neither pill nor container.

**The Floor-Is-The-Default Rule.** A button's target is 44px, and the default size is exactly the
floor rather than a step above it — so a call site that names no size lands on the floor by
omission. The sub-floor sizes stay in the ramp but not in shipped code: 25 call sites across ten
files had drifted onto them, the smallest at 134×28. The hit-area trick the selection controls use
was not available as a remedy — measured, those buttons sat 4–9px from their neighbours against the
12–16px an enlarged hit area needs, so it would have overlapped every row rather than enlarging it.
The boxes grew instead. A height in `className` beats the size variant through `tailwind-merge`,
exactly as a stray `rounded-*` beat the shape, so the guard checks that too.

**The Outline-Means-Outline Rule.** New components get no border; separation comes from elevation and background contrast. The name `outline` is the one sanctioned exception, and it runs one way: a variant called `outline` carries a visible stroke. A stroke elsewhere is allowed only where a token exists for the purpose — `--destructive-border`, `--status-*-border` — never as a hand-rolled edge. A borderless `outline` is the defect this rule exists to catch — the badge shipped one, measuring 1.00:1 against its own ground in both themes, which is a variant naming a treatment it did not have. Two exceptions are named rather than implied: `--destructive-border` in dark, a contrast remedy for a fill that reaches only 2.50:1 on Night Canvas, and the `outline` + `size='icon'` compound variant, which drops to `border-0` because a floating map control is a circle on a card, not an outlined affordance. `src/test/border.test.ts` enforces the rule.

## Components

The character line for every primitive: **soft, pressable, borderless.** Depth does the work an outline used to do.

### Buttons

- **Shape:** fully round pill (`border-radius: 9999px`). The base carries a 1px transparent border — every variant is the same height, and the invalid state has a width to paint into. Heights: `xs` 28px growing to 32px at `sm:`, `sm` 32px, default 44px (`h-11`), `lg` 48px, icon-only a 44px circle. `xs` is the only size with a responsive step and it meets `sm` on desktop rather than crossing it. **`xs` and `sm` are below the touch floor and no shipped surface may ask for them** — they survive as the documented ramp and as a deliberate escape hatch, and `src/test/touch-target.test.ts` keeps them out of shipped code.
- **Primary:** Chlorophyll Bright fill with Chlorophyll Deep text — green on deep green, not green on white, at 7.46:1. `0 1.5rem` padding, reduced to `1rem` when the label carries an icon, with a `0 2px 8px rgba(0,0,0,0.18)` shadow that reads as a physical lift rather than an outline.
- **Hover / Focus:** background steps down to `--primary-hover` (`oklch(0.62 0.17 150)`) and the shadow deepens to `0 3px 12px rgba(0,0,0,0.22)`. That step is chosen, not eyeballed: it keeps Chlorophyll Bright's chroma and steps lightness down, holding the Chlorophyll Deep label at 4.75:1 while the fill itself reaches 3.33:1 on Field Paper. `oklch(0.58 0.18 150)`, the step it replaces, was outside the sRGB gamut — the browser clamped it — and dropped the label to 4.14:1. No transform, no scale — the surface gets heavier, it doesn't move. Focus rings use `--ring` (Chlorophyll Readable), painted on `:focus-visible` only, and sit outside the button on a 2px offset, so they measure against the page rather than against the fill.
- **Destructive:** identical geometry, Fly Agaric fill with a white label — 7.21:1 in light, 6.04:1 in dark — hovering to `--destructive-hover` (`oklch(0.40 0.17 28)`), which holds white at 9.85:1. In dark the fill alone reaches only 2.50:1 against Night Canvas, so the variant adds `--destructive-border`. A delete in this system reads as red, and hue 28 appears nowhere else.
- **Ghost:** transparent with Ink text, washing to Chlorophyll Mist with a Chlorophyll Readable label on hover.
- **Link:** Chlorophyll Readable with a standing underline, dropping the underline on hover. The underline is not decoration: without it `link` and `ghost` computed the same label over the same transparent fill and were one button under two names.
- **Outline:** the sanctioned bordered exception — a 2px stroke on transparent, no shadow, washing to Chlorophyll Mist on hover. Stroke and label are one token, `--primary-text`: 7.85:1 on Field Paper and 5.15:1 on Night Surface. It cannot be `--primary`, which measures 2.94:1 and 4.36:1 on those two grounds — under the 1.4.11 floor and under AA respectively — and the light variant's fill is 1.00:1, so the stroke is its only boundary. Its sibling `enhanced-outline` carries the same stroke on Field Paper with an `elevation-control` lift, inverting on hover to a solid `--primary` fill with a `--primary-foreground` label at 5.36:1; white on that fill would be 3.00:1. The badge's `outline` is the same idea one tier down: a 1px stroke at 7.73:1, because a 20px pill has no room for a 2px edge and no shadow to fall back on.
- **Secondary:** a Moss wash whose fill measures 1.10:1 against paper. That is deliberate and not a defect: identification rides on the 5.02:1 label and the elevation, the way a text label satisfies 1.4.11 where a boundary does not.
- **Invalid:** `aria-invalid` colours the base's border on all seven variants — `--destructive` in light at 7.09:1, and `--destructive-border` in dark at 4.80:1, because the fill tone reads only 2.50:1 there. No variant may declare a dark-mode border colour of its own: `dark:border-primary` used to win here and paint an error in the brand green.

### Chips

- **Style:** fully round, `0.125rem 0.5rem` padding, 12px medium text, 12px inline SVG icons. The base carries a 1px transparent border so every variant is the same height and only the ones that want a stroke show one.
- **State:** default is a Chlorophyll Bright fill with Chlorophyll Deep text (note: the literal `--happy-500`, one step brighter than `--primary`, so a badge reads as a marker rather than a small button). Secondary is the Moss tint pairing. Destructive is Fly Agaric with white text, plus a `--destructive-border` edge in dark where the fill alone reaches 2.50:1. Outline is transparent with a 1px Chlorophyll Readable stroke. Warning, success and info fill from the status tokens; success and info both resolve to `--primary-text` today and are wired to their own tokens so they diverge when the tokens do.

### Cards / Containers

- **Corner Style:** 20px (`1.25rem`) — the photo-first trail card.
- **Background:** Field Paper on light, Night Surface on dark. `surface="glass"` swaps the fill for `.glass-regular`, and is scoped the same way glass always is: small floating chrome over the map, never a large content card.
- **Shadow Strategy:** `raised` at rest. The escalation to raised-hover is `interactive`, and it belongs only to a card that is itself a link or a button — a card that merely _contains_ one does not lift, because the lift is a promise that the whole tile is a target.
- **Border:** none. `surface="glass"` is the exception: the glass treatment carries its own hairline, so the paper fill and the `border-0` that suppresses it live together on `surface="solid"`.
- **Internal Padding:** two named steps, never a per-call-site value. `content` (the default) supplies `py-6` (24px) while the header, content and footer regions supply `px-6` (24px), with a `gap-1.5` (6px) title-to-metadata rhythm. `compact` is `p-3` (12px), for map chrome — a card carrying a control cluster rather than a title and a body. `padding="none"` is for full-bleed media and for bodies that pad themselves, and is the exception: a scroll container or a fill-the-card placeholder.
- **Region Rhythm:** each padding step carries its own gap between regions, so the header never sits flat on the body — `content` is `gap-6` (24px), `compact` `gap-3` (12px), and `padding="none"` keeps `gap-0`, because a full-bleed card's media has to reach the card edge. A region never pads itself vertically; `src/test/card.test.tsx` enforces both halves.
- **Regions:** a content card composes `CardHeader` / `CardContent` / `CardFooter`. They are where the horizontal padding, the title-to-metadata rhythm and the `CardAction` column live, so a card that puts bare `div`s inside re-implements all three by hand — which is what made `padding="none"` look like the common case rather than the exception it is.
- **Clipping:** `media` clips children to the card radius, and only photo-bearing cards should set it. Clipping is not free — `overflow: hidden` also clips the focus ring of any control that reaches the card edge, and the card has no padding below its footer. Measured, not assumed: an ancestor that clips cuts the outline flat, which is why a field's focus border carries the same token as its ring rather than trusting the ring to survive.
- **Title:** a real heading. `CardTitle` renders `h3`, and `as` picks the level so a card lands in the page outline where it belongs.

**The Zero-Is-An-Invitation Rule.** A shared base that sets a spacing value to zero is not expressing "no opinion" — it is delegating the decision to every call site, and they will disagree. The card's own comment claimed it owned the vertical rhythm while the base shipped `gap-0`; five call sites then re-invented that gap by padding the regions, at four different values (`pb-2`, `pb-3`, `pt-0`, `pt-3`, `pt-4`), and the two surfaces that never compensated shipped a title sitting flat on its body. When a component's documentation claims a dimension, the base has to supply a real value for it — and a guard that reads only the properties the base _does_ set will never see the one it zeroed.

### Inputs / Fields

- **Style:** 48px-tall (`h-12`) fully round pill on a Field Paper background with a Hairline border and a `raised-subtle` shadow. Base `px-4` padding, with callers that place a leading icon switching to `pl-11` themselves. Text is 16px, tightening to 14px at `md:` and up.
- **The Hairline:** the field is the sanctioned bordered exception to Outline-Means-Outline, and the stroke is a token (`--border`) rather than a hand-rolled edge. It is decorative, not a boundary — **1.30:1** in light and **1.41:1** in dark against the field's own interior — and the separation is carried by `raised-subtle` plus, in dark, the `--input/30` fill. It stays for two reasons: in light `--card` and `--background` are the same value, so an empty field has nothing else distinguishing it from the page; and focus and error need a width already present to paint into, which is the same reason the buttons carry a transparent one.
- **Focus:** two things paint, and they are one token. `.focus-ring` puts a 2px `--ring` outline on a 2px offset, and the field's own border becomes `--ring` as well: **7.85:1** in light and **4.78:1** in dark against the interior. One token, so a field inside a clipping ancestor — which cuts the outline off — still has a border clearing 1.4.11 on its own. It cannot be a literal `--happy-*` step: `--happy-500` measured **2.12:1** in light, and `--primary` measures 2.95:1, both under the 3:1 floor without a ring to lean on.
- **Error:** `aria-invalid` reddens the border to `--destructive-text`, Fly Agaric — the same step the selection controls use, and for the same reason. The plain `--destructive` step reads **2.20:1** against the dark field interior and **2.51:1** against the page, under the 3:1 floor; `--destructive-text` reads **5.38:1** and **6.14:1**. In light all three destructive steps are one value at 7.09:1, so the defect was invisible there and the fix changes nothing.
- **Transition:** `color, border-color, box-shadow`. Two of these borders change colour, so a list that omits `border-color` snaps both the focus edge and the error edge.

### Selection Controls

Checkbox, radio and switch. The three share one boundary rule, one indicator rule and one
hit-area rule, because they share the same failure: a control whose only edge is a stroke.

- **Style:** a 20px box on the checkbox with a `sm` corner, a 20px circle on the radio, a
  32×18px track on the switch. All three carry a 2px stroke and **no shadow** — an inline
  control inside a form does not float above anything, so no elevation level rides one.
- **Boundary:** the stroke is Chlorophyll Readable (`--primary-text`), not Chlorophyll Bright
  (`--primary`). An unchecked box has no fill, so the stroke is the only thing saying the
  control exists, and the bright step measures **2.94:1** on the page against the WCAG 1.4.11
  floor of 3:1; the readable step measures **7.85:1** light and **6.44:1** dark. The stroke
  keeps that step when checked, so the boundary never rests on the fill's own contrast — which
  is still 2.94:1, and no longer has to carry anything.
- **State indicator:** the checkbox tick is `--primary-foreground` on the bright fill
  (**5.36:1** light, **6.27:1** dark). The radio dot is `--primary-text` on a transparent box
  (**7.85:1** / **6.44:1**), pinned on both `fill` and `text` because the icon's stroke follows
  `currentColor` while its body follows `fill`. The switch knob is a fixed light `white` in
  both states and both themes, and never changes colour: a knob that recolours per state reads
  as a hole punched in the track rather than a moving part, and `--background` darkens into
  exactly that hole in dark. The off track stays pale (`--input`), so the knob carries its own
  1px outline: `--foreground` measures **12.37:1** off and **5.44:1** lit in light, and **6.10:1**
  off in dark, but collapses to **2.34:1** on the lit track in dark — the one place it fails, so
  dark swaps the outline to `--border` for **3.40:1**. Every state clears the 3:1 floor on at
  least one boundary. The knob's shadow is depth only: a blur is not a measurable boundary.
- **Error:** `aria-invalid` reddens the stroke to `--destructive-text`. The plain
  `--destructive` step used by Inputs measures **2.50:1** in dark, so a selection control — whose
  stroke is its whole boundary — cannot borrow it.
- **Transition:** every property that changes colour is named. The checkbox transitions
  `color, background-color, border-color, box-shadow`; a control that transitions only the
  shadow snaps its fill and its stroke.
- **Hit area:** 44px, from a centred `::before` that does not change the visual size. Field use
  is one-handed and outdoors, so this is a requirement rather than a refinement. A radio group
  spaces items 24px (`gap-6`) so two 44px targets on 20px boxes cannot overlap — overlapping
  targets trade a missed tap for a wrong one.
- **One size:** none of the three takes a size prop. A size scale that no caller can reach is
  dead documentation, not flexibility.

**The Stroke-Is-The-Control Rule.** When a control's only boundary is its stroke, that stroke
carries the non-text contrast floor in every state it can reach — unchecked, checked, invalid
and hover alike. Fill colour is interior decoration; the stroke is the control.

### Collapsible

A disclosure is the one primitive whose whole job is a state change over time, so the motion is
part of the component rather than a caller's garnish.

- **Height, on the shared tokens:** the content animates between `0` and
  `--radix-collapsible-content-height`, the measured height the primitive already publishes, over
  `--transition-duration-base` on `--ease-standard`. A disclosure that snaps gives no clue which
  way the content went.
- **The chevron turns with it, by default:** the trigger's trailing glyph rotates 180° on that
  same duration and curve, so the arrow and the height finish together. It is plain CSS keyed off
  `[data-slot='collapsible-trigger'][data-state='open']`, which `asChild` puts on the caller's own
  trigger, so the caller picks the glyph and never wires `data-state`. `svg:last-child` leaves a
  leading icon alone. It sets the `rotate` property rather than `transform` — the same one
  Tailwind's own `rotate-*` utilities set — and `@layer utilities` orders after
  `@layer components`, so a caller who wants a different angle replaces this one instead of
  composing with it.
- **Padding never sits on the animating box:** padding does not collapse with height, so 12px of
  it would leave the closed state 12px tall instead of nothing. The component takes the caller's
  `className` and puts it on an inner box, and keeps `overflow-hidden` and the animation on the
  outer one. Callers style the content and never think about it.
- **Reduced motion is already covered:** the global rule collapses every animation to `0.01ms`,
  so the disclosure still lands in its new state, just without the travel. No second rule and no
  per-component opt-out.
- **The trigger belongs to the caller,** as `asChild` on whatever component fits — a Button in the
  catalogue, a `SidebarMenuButton` in the nav. Disabling the root is enough: the primitive
  forwards `disabled` through `asChild`, so the trigger greys itself and needs no second prop.

**The Animation-Is-The-Affordance Rule.** When a component's purpose is a transition between two
states, the transition is the component's own, not the caller's. Anything a caller must remember
to add for the component to read correctly belongs inside it.

### Dialog & Sheet

Both are the same primitive wearing two geometries: Dialog centres a panel, Sheet slides one in
from an edge. They carry the same scrim, the same corner dismiss and the same containment rule,
so a fix to one that skips the other leaves a twin broken in exactly the same way.

- **A panel never grows past the viewport.** The content caps its own height — `100dvh` less a
  `2rem` margin for Dialog, `100dvh` for Sheet — and scrolls an inner body instead. Height and
  scroll belong to the component: a modal that overflows has no page scroll to fall back on,
  because opening it locked the body, so anything below the fold is simply unreachable. A caller
  that wants a shorter panel still passes `max-h-*` and overrides the cap.
- **Padding and gap sit on the scrolling body, not on the capped panel.** Spacing on the element
  that owns `max-height` would eat into the scroll box and clip its last row.
- **The corner dismiss stays put while the body scrolls.** It is positioned against the panel
  rather than the scrolling content, so the way out never scrolls away — the failure mode that
  matters most on a small screen. It carries the panel's own background so body text passing
  underneath stays legible, which reads as a bare glyph on a plain panel.
- **44×44, like every other target.** The glyph stays 16px; the hit area is the button.
- **The glyph needs a dark twin.** `--happy-700` reads 7.85:1 on a light panel and 1.89:1 on a
  dark one, under the 3:1 an interactive glyph has to clear. `--happy-300` restores it to 9.96:1,
  and the hover surface flips from `--happy-50` to `--happy-900` so the tint stays as quiet in
  dark as it is in light.
- **The scrim is a token.** `--scrim` is black at 50%, in both themes. It is deliberately not
  `--background-overlay`, which is the heavier veil the `.overlay` component in `globals.scss`
  paints itself with — one name for a full-screen scrim, another for a component's own fill.
- **Enter and exit ride `--transition-duration-slow`** on `--ease-standard`, scrim and panel
  together. A surface this large reads as abrupt on the shorter durations, which is what the token
  comment has always said.
- **Elevation follows the depth scale:** Dialog takes `elevation-overlay`, Sheet
  `elevation-floating`.
- **`aria-modal` is absent on purpose.** The primitive `aria-hidden`s every sibling of the portal
  instead, which is the better-supported equivalent. Measured on the open dialog: 11 siblings
  hidden, the portal untouched. Adding the attribute by hand would be duplicating a mechanism
  that already works.

**The Escape-Hatch-Never-Scrolls Rule.** When a surface traps focus and locks the page behind it,
every way out of it must stay reachable at any scroll position and any viewport height. A dismiss
that scrolls out of reach is a dead end, not a style detail.

### Menus

DropdownMenu and Select are one surface under two names: the same popover, the same row, the same
focus tone. `dropdown-menu.tsx` is the larger of the two and `select.tsx` mirrors it, so a fix that
lands on one and skips the other leaves a twin broken identically — which is how five row types
ended up wearing two different focus tones.

- **Every row type shares one focus tone, and that tone has a dark twin.** `--happy-100` fill with
  `--happy-900` text: 1.18:1 against the popover in light with the label at 13.34:1. The twin is not
  cosmetic. `--happy-100` is defined identically in both themes while `--accent` inverts, so a
  single-theme tone diverges nine-fold in dark — the green row measured 10.02:1, a floodlit block,
  and the accent rows 1.10:1, nearly invisible. `--happy-900` fill with `--happy-100` text restores
  the dark row to 1.33:1 with the label back at 13.34:1, closest of the ramp to the light reference
  and the symmetric partner of the light pair. Plain, checkbox, radio and sub-trigger rows all take
  it; the open sub-trigger takes the same pair on `data-[state=open]`.
- **A destructive row carries its own dark twin.** With the base twin in place and none on the
  variant, a Delete row repaints as a plain green row in dark only. Its own twins hold it at 1.09:1
  of fill with the red label at 4.50:1, against 1.33:1 / 13.34:1 for a green row — distinguishable
  by hue, not just by tone. The label is `--destructive-text`, never `--destructive`, whose fill
  reads 2.00:1 as text on the dark popover.
- **Rows sit in two text columns, not three.** Label, plain item and sub-trigger share the item
  column at 16px; only rows that reserve space for an indicator — `inset`, checkbox, radio — step
  out to 32px. A clickable row that does not line up with the other clickable rows is drift, and a
  sub-trigger is as clickable as an item. Select's label and item share the same column, which is
  also the column its trigger's `px-4` puts the closed value in.
- **A row is `rounded-xl`, and that is the largest it may be.** Concentric radius on a 20px card
  with 4px padding would ask for 16px, but 16px is `rounded-2xl`, which `src/test/radius.test.ts`
  bans as an invented middle radius. 12px is the top of the derived scale and the row takes it.
- **Menus ride `--transition-duration-fast`** on `--ease-standard`. `animate-in` alone inherits
  Tailwind's default duration — which happens to be the fast token — and the browser's generic
  `ease`, so the duration was right by accident and the curve was never a token at all. Both are
  now explicit on all three surfaces. Menus are deliberately outside the `slow` band that Dialog
  and Sheet sit in: a row list is small and appears under the pointer.
- **A submenu contains its own height, like its parent.** The top-level content caps against
  `--radix-dropdown-menu-content-available-height` and scrolls; the submenu carried `overflow-hidden`
  and no cap. Measured with 25 rows in a 708px viewport, it grew to 904px, and
  `document.elementFromPoint` on the last row returned nothing — the rows were not scrolled off,
  they were gone. It now takes the same cap and the same `overflow-y-auto`.
- **A checkbox row keeps the menu open; a radio row closes it.** Toggling several boxes is one
  visit, and the primitive closes on select unless the event is prevented, so the base prevents it.
  Picking one radio value ends the interaction, so that row still closes. A caller's own `onSelect`
  runs either way.
- **`DropdownMenuShortcut` displays a shortcut, it does not bind one.** It is a `<span>`. The key
  handler stays the caller's job.

**The Dark-Twin-Eats-The-Variant Rule.** A `dark:` on a base ties with a state variant on
specificity and orders after it, so it wins. Add a dark twin to a base and every variant that
declared the light equivalent needs its own twin in the same breath — and darken a variant and the
base needs one too. It runs in both directions, and the symptom is a variant that is correct in one
theme and silently identical to the base in the other.

### Navigation

- **Style:** both nav surfaces are elevation `raised` with Glass Regular, and both consume one shared constant (`NAV_SURFACE_CLASS` in `src/lib/nav-surface.ts`) so desktop and mobile chrome cannot drift apart. On the shadcn `Sidebar` the treatment must land on the painted surface (`data-slot='sidebar-inner'`), not the positioning container `className` targets — otherwise the surface's own background paints over the glass.
- **Typography:** Public Sans label sizes; nav item text stays Ink even when hovered or active.
- **Default / hover / active:** only the background tint changes on hover and active — Chlorophyll Tint (`--sidebar-accent`) behind an unchanged label. The active item additionally carries a section-adaptive accent on its own icon and label, and on mobile a slight scale.
- **Mobile treatment:** the bottom bar is 70px at `≤768px`, and its active tint must use `--happy-500`, not `--happy-700`: over translucent dark chrome above a light map, the darker step falls to 1.7:1 and breaks the WCAG 1.4.11 3:1 floor.
- **Relevance-based disclosure:** items appear based on platform and feature context rather than the full set always rendering.

### Motion

Three durations and one curve, and everything references them: `--transition-duration-fast: 150ms` for elevation hover and press micro-interactions, `--transition-duration-base: 200ms` for default state changes, `--transition-duration-slow: 300ms` for floating and overlay enter/exit, all on `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)`. The names carry Tailwind's `--transition-duration-*` prefix so the scale _is_ the `duration-*` utility namespace, and `--default-transition-duration` / `--default-transition-timing-function` point at it, so even a bare `transition-colors` references the scale. Under `prefers-reduced-motion` non-essential motion collapses to `0.01ms` rather than being deleted — the state change still lands, it just arrives instantly, and a transition that never fires could leave a component wedged mid-state. That takes two rules, not one: a global CSS rule, plus `<MotionConfig reducedMotion='user'>` for the inline transforms framer-motion writes from JavaScript, which no stylesheet can reach.

**The Weight-Not-Movement Rule.** Interaction feedback changes shadow and background. It does not scale, translate, or rotate chrome. Two transforms are sanctioned, and both report state rather than feedback: the mobile nav's active-item scale, and a disclosure chevron's rotation, which the Collapsible owns rather than each caller. A collapsible's height animation is not a transform and is exempt.

## Do's and Don'ts

### Do:

- **Do** pick an elevation role (`.elevation-raised`, `.elevation-floating`) and let the shadow follow. Reach for `.elevation-interactive` when the surface responds to hover.
- **Do** keep every colour in its lane: `--primary-text` and Moss Text for text and icons, `--happy-500` / `--happy-600` / `--status-warning` for fills and indicators only.
- **Do** keep severity on hue 28. `--destructive` is Fly Agaric in both themes; a delete is never the darkest green on screen. Use `--destructive-text` when the severity lands on text, since the fill tone reads 2.00:1 as a label on dark surfaces.
- **Do** reach for `--primary-text` for any green text or icon, and `--status-warning-background` for any warning callout. Those two tokens cover the cases that used to reach for Tailwind blue and Tailwind amber.
- **Do** read category colour through `src/lib/categoryColor.ts`, and always ship a category colour with its icon and label — five steps of one hue separate less well than five hues did.
- **Do** define the opaque background before the translucent one on any glass surface, and honor `prefers-reduced-transparency` and `prefers-contrast`.
- **Do** consume `NAV_SURFACE_CLASS` for any new nav chrome instead of respelling `elevation-raised glass-regular`.
- **Do** keep interactive targets at 44px or larger (48px for the search field). Field use with cold hands is a real constraint.
- **Do** add tokens to the `@theme` block in `src/index.css` — that is the live theme.
- **Do** use a semantic token (`--primary`, `--primary-text`, `--destructive`, `--secondary`) when a component has to work in both themes; the `--happy-*` steps are absolute and light-tuned.
- **Do** test text-bearing components in German before calling them done.

### Don't:

- **Don't** introduce a new hue angle. No blue for links or info, no amber of its own, no hue-coded categories. Chromatic is 150, neutral is 90, danger is 28 and only for `--destructive`, warnings borrow ramp stops, and `src/test/palette.test.ts` enforces it — a new hue is caught whether it arrives as `oklch()` or as hex.
- **Don't** reach for a Tailwind colour utility. `text-gray-700`, `bg-blue-50`, `border-red-500` and the other 20 families emit nothing — if a colour class renders no colour, that is why.
- **Don't** write an arbitrary `shadow-[…]` on a new component. It bypasses the role system and will not pick up the dark-theme inset highlight.
- **Don't** treat `--shadow-*` as the elevation scale. It is legacy, materially weaker than what ships, and aliasing to it regresses the live look (ADR 0001).
- **Don't** put glass on the map canvas, on a dialog, or on anything text-heavy or size-animating.
- **Don't** use `--happy-500`, `--happy-600` / `--primary`, or `--status-warning` as a text color. All three are fill-only, held to the 3:1 non-text floor; `--status-warning` gives 3.91:1 at best, so warning callouts use `--status-warning-background`.
- **Don't** use `--happy-700` for the mobile nav's active tint — 1.7:1 over translucent dark chrome on a light map.
- **Don't** add a cool grey or a pure `#ffffff` to either theme. Every neutral is hue 90. The only surviving pure whites are translucent washes over media and the QR code, which needs literal `#000`/`#fff` to scan.
- **Don't** add a border to a primitive unless the variant is called `outline`, or the stroke is `--destructive-border` earning back contrast in dark. And don't ship an `outline` without one — the name is a promise.
- **Don't** put theme values in `tailwind.config.js` — it carries no theme and is retained only for the shadcn CLI.
- **Don't** make `body` scroll. The shell is fixed at `100dvh`; give overflowing content its own scroll container.
- **Don't** apply a surface treatment to the `Sidebar`'s positioning container. It must land on `data-slot='sidebar-inner'` or the background paints over it.
