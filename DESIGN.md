---
name: Fung.es
description: A foraging map PWA whose interface floats over living terrain — warm paper, one living green, glass chrome.
colors:
  chlorophyll-mist: 'oklch(0.97 0.03 152)'
  chlorophyll-tint: 'oklch(0.93 0.06 152)'
  chlorophyll-soft: 'oklch(0.85 0.12 151)'
  chlorophyll-bright: 'oklch(0.74 0.17 150)'
  chlorophyll-pressed: 'oklch(0.65 0.18 150)'
  chlorophyll-readable: 'oklch(0.42 0.13 150)'
  chlorophyll-deep: 'oklch(0.24 0.07 150)'
  moss-fill: 'oklch(0.9582 0.0193 147.8505)'
  moss-text: 'oklch(0.5262 0.1294 147.1971)'
  lichen: 'oklch(0.6731 0.1624 144.2083)'
  field-paper: 'oklch(0.9938 0.0013 106.4231)'
  warm-linen: 'oklch(0.952 0.0083 91.4843)'
  trail-tan: 'oklch(0.9356 0.0194 72.5693)'
  bark: 'oklch(0.4506 0.0552 64.6273)'
  ink: 'oklch(0.2431 0.0076 95.3724)'
  stone: 'oklch(0.5261 0.0151 82.3829)'
  hairline: 'oklch(0.9071 0.01 87.4748)'
  night-canvas: 'oklch(0.2683 0.0279 150.7681)'
  night-surface: 'oklch(0.3327 0.0271 146.9867)'
  status-amber: '#f59e0b'
  status-success: '#4cba73'
  status-info: '#3b82f6'
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

The mood is fresh, alive, and tactile. A single spring-green hue does all the signalling, and it is a green with actual chroma in it — `oklch(0.74 0.17 150)`, the color of new growth rather than corporate forest. Everything interactive is a soft-edged pill with a diffuse drop shadow and no border, so surfaces read as pressable objects sitting on warm paper rather than as boxes drawn onto a page. Warm neutrals carry the ground (`#fdfdfc` paper, `#f1efe9` linen, `#f2e8dc` tan): there is no cool grey anywhere in the light theme, and the absence is deliberate — cool grey is what makes an outdoor tool feel like an admin panel.

Restraint is enforced in exactly one place and it is the sharpest rule in the system: there is no second hue. No red, not even for destructive actions. Severity is expressed as depth on the green scale, not as a change of hue. The one thing this system rejects is the multi-hue semantic palette — a green for success, a red for danger, a blue for info — and the rejection is already shipped in `--destructive: var(--happy-900)`.

**Key Characteristics:**

- One hue, seven steps: a spring-green scale carries brand, state, and severity alike.
- Warm-neutral ground; zero cool grey in the light theme.
- Borderless, full-round, shadow-lifted interactive surfaces.
- Five semantic elevation roles, chosen by meaning rather than by shadow value.
- Glass as an opt-in material on small chrome only — never on the map, never on a dialog.
- Contrast floors treated as hard limits, because the surface underneath is a photograph of the world.

## Colors

A single spring-green scale doing every job a palette usually spreads across four hues, laid over warm paper neutrals.

### Primary

- **Spring Chlorophyll Bright** (`--happy-500`): the go-signal. Solid fills on primary buttons and default badges, always paired with Chlorophyll Deep text rather than white. Bright enough to read as "new growth" and deliberately never used as a text color on paper.
- **Spring Chlorophyll Pressed** (`--happy-600`, aliased as `--primary` and `--ring`): the canonical brand value every custom component inherits through `bg-primary` / `text-primary` / `border-primary`, and the focus-ring color. One step down from Bright so pressed and focused states read as settling, not brightening.
- **Spring Chlorophyll Readable** (`--happy-700`): the only green permitted as text or icon color on light surfaces. Ghost-button labels and green iconography live here.
- **Spring Chlorophyll Deep** (`--happy-900`, aliased as `--destructive` and `--primary-foreground`): text on bright green fills, and the stand-in for danger. Destroying something is the deepest green in the system, never red.
- **Spring Chlorophyll Mist / Tint / Soft** (`--happy-50` / `--happy-100` / `--happy-300`): wash states. Mist is ghost-button hover; Tint is the sidebar's hover/active nav background; Soft is available for large low-emphasis fills.

### Secondary

- **Moss Fill** (`--secondary`) with **Moss Text** (`--secondary-foreground`): the quieter, older green pairing that predates the Trailhead scale. Secondary badges and low-emphasis chips. Light tint plus dark text, never a solid mid-green fill with white text.
- **Lichen** (`--primary` / `--chart-1` / `--sidebar-primary` in dark mode): the dark theme's green. Lighter and less saturated than the Trailhead scale because a vivid green cannot hold its contrast against `#171717`.

### Tertiary

- **Trail Tan** (`--accent`) with **Bark** (`--accent-foreground`): the warm-neutral accent pairing, used where a surface needs to feel like material rather than UI. This is a light tint with dark text by deliberate choice — the solid warm-brown fill it replaces reaches only 3.53:1 with white text and fails body-text contrast.

### Neutral

- **Field Paper** (`--background`, `--card`, `--popover`): the light theme's ground and every card surface. Warm off-white, never `#fff`.
- **Warm Linen** (`--muted`): muted fills and inactive tracks.
- **Ink** (`--foreground`): all body and heading text on light surfaces.
- **Stone** (`--muted-foreground`): secondary and tertiary text. The `.text-secondary` and `.text-tertiary` utilities both resolve here — the tertiary step is nominal, not a distinct value.
- **Hairline** (`--border`, `--input`): dividers and the few borders that survive. Most components have none.
- **Night Canvas** (dark `--background`, dark `--sidebar`) and **Night Surface** (dark `--card`, `--muted`, `--popover`): the dark theme's two grounds. Both carry a green cast in their chroma rather than being neutral black.

### Status

- **Status Amber** (`--status-warning`), **Status Success** (`--status-success`), **Status Info** (`--status-info`): flat across both themes. Amber is the one that earns its keep — foraging safety warnings are the single place this system permits a non-green hue, and `--status-warning-text` / `--status-warning-border` are mixed toward black rather than toward the foreground so they hold contrast on the bright amber fill in either theme.

### Named Rules

**The One Hue Rule.** The Trailhead scale is the only brand hue on any screen. Severity is depth, not hue: `--destructive` resolves to `--happy-900`. The sole exception is safety warning amber, which exists because a toxic-lookalike warning must not read as decoration.

**The Text-Safe Step Rule.** Greens split into text-safe and fill-only. `--happy-700` and Moss Text are text-safe. `--happy-500` and the `grass9`-derived values are fills, rings, and non-text indicators only, held to the 3:1 non-text floor. Using a fill-only green as a text color is a contrast bug, not a style choice.

**The Light-Only Rule.** The `--happy-*` scale is a light-theme scale; it was never reviewed in dark mode. Dark-mode components fall back to the pre-existing tokens (Lichen, Night Surface) instead. When adding a component that hardcodes a `--happy-*` step, pair it with a dark-mode fallback that doesn't.

**The Warm Ground Rule.** No cool grey in the light theme. Every neutral carries a warm hue angle (64–107 in OKLCH). A `#f5f5f5`, a `slate-100`, or a pure `#fff` background is out of system.

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

In light mode the roles are diffuse black drop shadows. In dark mode the geometry is identical (same offsets, same blur, so it stays recognizably one scale) but the alpha deepens and a 1px inset white highlight becomes the primary depth cue, because a 6–24% black shadow is invisible against `#171717`. Per ADR 0001 these are _not_ aliases of the `--shadow-*` scale, which is weaker and predates the current look; the `--elevation-*` tokens are the single source of truth and `--shadow-*` is legacy.

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
- **Do** keep every green in its lane: `--happy-700` and Moss Text for text and icons, `--happy-500` for fills and indicators only.
- **Do** express severity as depth on the green scale. `--destructive` is `--happy-900` and that is correct, not a placeholder.
- **Do** define the opaque background before the translucent one on any glass surface, and honor `prefers-reduced-transparency` and `prefers-contrast`.
- **Do** consume `NAV_SURFACE_CLASS` for any new nav chrome instead of respelling `elevation-raised glass-regular`.
- **Do** keep interactive targets at 44px or larger (48px for the search field). Field use with cold hands is a real constraint.
- **Do** add tokens to the `@theme` block in `src/index.css` — that is the live theme.
- **Do** pair any component that hardcodes a `--happy-*` step with a dark-mode fallback on the pre-Trailhead tokens.
- **Do** test text-bearing components in German before calling them done.

### Don't:

- **Don't** introduce a second hue. No red for destructive, no blue for info, no amber outside genuine foraging safety warnings.
- **Don't** write an arbitrary `shadow-[…]` on a new component. It bypasses the role system and will not pick up the dark-theme inset highlight.
- **Don't** treat `--shadow-*` as the elevation scale. It is legacy, materially weaker than what ships, and aliasing to it regresses the live look (ADR 0001).
- **Don't** put glass on the map canvas, on a dialog, or on anything text-heavy or size-animating.
- **Don't** use `--happy-500` or any `grass9`-derived green as a text color. It is held to the 3:1 non-text floor only.
- **Don't** use `--happy-700` for the mobile nav's active tint — 1.7:1 over translucent dark chrome on a light map.
- **Don't** add a cool grey or a pure `#ffffff` to the light theme. Every neutral is warm.
- **Don't** add a border to a new primitive. The outline button pair (`outline`, `enhanced-outline`) is the system's entire bordered vocabulary.
- **Don't** put theme values in `tailwind.config.js` — it carries no theme and is retained only for the shadcn CLI.
- **Don't** make `body` scroll. The shell is fixed at `100dvh`; give overflowing content its own scroll container.
- **Don't** apply a surface treatment to the `Sidebar`'s positioning container. It must land on `data-slot='sidebar-inner'` or the background paints over it.
