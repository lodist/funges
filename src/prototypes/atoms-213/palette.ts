// PROTOTYPE — throwaway. Reference values only.
//
// A "happy green" scale for the Trailhead direction: lighter/more vivid
// than the app's current dark forest --primary, used as the ONLY hue in
// the palette (no red, even for destructive/danger — severity is conveyed
// by how deep the green is, not by hue). Scoped to this prototype page
// only — none of this touches src/index.css.
//
// IMPORTANT: these are documentation only. Do NOT build Tailwind class
// names by interpolating these into a template literal at runtime, e.g.
// `bg-[${green[500]}]` — Tailwind's JIT scanner statically greps *source*
// files for complete class-name strings; it never sees the string a
// template literal resolves to at runtime, so a dynamically-built
// arbitrary-value class silently never gets generated (the element just
// falls through to whatever CSS wins next — in this app, `globals.scss`'s
// unscoped `button{}` base-layer reset). Lost an hour to exactly that.
// Every class in recipes.ts spells the oklch() value out literally instead.
export const green = {
  50: 'oklch(0.97 0.03 152)', // ~#eef8f0 — faint mint tint (hover bg, tag bg)
  100: 'oklch(0.93 0.06 152)', // ~#d9f0dd — light tint (soft badges)
  300: 'oklch(0.85 0.12 151)', // ~#a9e0b6 — mid tint (borders, chip ring)
  500: 'oklch(0.74 0.17 150)', // ~#4bd672 — HAPPY primary: bright, vivid
  600: 'oklch(0.65 0.18 150)', // ~#2fb85c — primary hover/pressed
  700: 'oklch(0.42 0.13 150)', // ~#1f6b3a — readable text/icon on light bg
  900: 'oklch(0.24 0.07 150)', // ~#12341f — deep green, replaces red for danger
} as const;
