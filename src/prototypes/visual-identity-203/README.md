# Prototype — #203 Color palette & typography redesign

**Throwaway. Do not build on this. Branch: `research/visual-identity-202`.**

Four variants of the color palette + typography, switchable via `?variant=`,
layered onto the existing `/species` route (chosen because it exercises
primary/secondary/accent/status tokens and real `<h1>`/`<h2>` headings with
zero network/map dependency — see `SpeciesPage.tsx`).

- `current` (default) — the app exactly as shipped, no override. Baseline for comparison.
- `a` — Forest/Moss + Warm Neutral (Radix `grass` + `sand`/`brown`) + Space Grotesk/Public Sans
- `b` — Deep Teal + Terracotta (Radix `teal` + `bronze`/`orange`) + Space Grotesk/Public Sans
- `c` — Sage + Charcoal (Radix `sage`, teal pulled in for actionable elements per the research
  doc's own pairing note) + Fraunces/Libre Franklin (editorial/field-guide register)

Sourced from `docs/superpowers/specs/2026-08-21-visual-identity-research.md` (#202).

**Deliberate deviation from the prototype skill's usual "structurally different variants"
rule:** #203's question is explicitly about color and typography, not layout — so the
variant axis here *is* color/type, on purpose, not "wallpaper." Nothing about the page
layout, information hierarchy, or components changes between variants.

## What's approximated

The research doc only pins down two Radix steps per direction (`9` solid-fill and `11`
text-safe) plus, for direction A, the `sand` neutral scale's two endpoints. Every other
token below (`secondary`, `muted`, `border`, `sidebar-*`, etc.) is extrapolated by hand
using the same "same hue, pull lightness up / chroma down" pattern the current
`src/index.css` already uses between `--primary` and `--accent` — not copied from the
real `radix-ui/colors` package. Before shipping any direction, pull the actual Radix
scale (`@radix-ui/colors`) rather than trusting these approximations.

## Running it

`npm run dev`, then open `/species?variant=a` (or `b` / `c` / `current`), or just load
`/species` and use the floating switcher (bottom-center, dev-only) to cycle with the
arrows or ← / → keys.

## How to capture the answer

Once a direction wins:
1. Fold its token values into `src/index.css` (`:root`, both light-mode only — dark mode
   is currently force-disabled in `theme-provider.tsx`) and the chosen fonts into
   `src/main.tsx` (replacing the Montserrat/Merriweather/Source Code Pro imports).
2. Verify every token pair against WCAG 1.4.3 / 1.4.11 with real contrast-checker numbers
   (the research doc's table, not this prototype, is the source of truth there).
3. Revert `src/routes/species.tsx` to drop the switcher, delete this directory, and drop
   the now-unused `@fontsource/*` devDependencies for the directions that lost.
4. Record the decision (which direction, why) on #203; this branch stays as the primary
   source, referenced from the issue.
