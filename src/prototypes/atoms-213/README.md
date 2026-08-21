# Prototype — Atom library redesign (#213)

**Throwaway code.** Answers the question in [#213](https://github.com/lodist/funges/issues/213):
what should the ~22 shadcn/Radix atoms in `src/components/ui/` look like,
redesigned against concrete AllTrails UI patterns instead of generic
"inspiration"? Scoped to atoms only — nav/map-cluster/species-selector are
separate tickets (#196–#198).

## Run it

```
npm run dev
```

then visit **`/atoms-213`** directly (not linked from the app nav — it's a
hidden kitchen-sink route). Switch direction with the pill bar fixed at the
bottom, or via the URL: `?variant=trailhead` / `?variant=ridge`.

Zero production files changed. Every control on the page is the real
component imported straight from `src/components/ui/*`; only the `className`
handed to it changes per variant (`recipes.ts`). That's also exactly how the
winning direction would get folded in for real — no rewrite needed.

## The two directions

Both are traceable to specific, current AllTrails patterns (search bar,
trail card, difficulty pill, map icon buttons, bottom-sheet actions,
"Hit the Trail" CTA) — not a vague "outdoorsy" mood board.

### A — Trailhead

A close mapping of AllTrails' actual chrome onto our species-card domain,
**recoloured per review** (2026-08-22):

- **Happy green scale, no red anywhere** — the original mapping inherited
  the app's existing dark forest `--primary`. Review wanted lighter/more
  vivid ("un verde FELICE"), and no red at all, even for destructive
  actions — so `palette.ts` defines a standalone green scale (50/100/300/
  500/600/700/900) used for _everything_, including "Report issue"/"Delete"
  (deepest step, `900`, stands in for destructive) and the edibility badges
  (light = safe, mid = caution, deep = avoid — severity via depth, not hue).
- **No borders except the one true outline button** — "Share" is the only
  bordered button (it's semantically `variant="outline"`); every other
  button (ghost, icon, destructive, chips, the save/heart toggle) is
  `border-0` at rest _and_ on hover — hover only ever shifts a fill/shadow,
  never reveals an outline.
- **Primary button text never turns white on hover** — stays the same deep
  green from the scale in both states; only the fill deepens slightly.
- **Pill buttons & search** — AllTrails' "Hit the Trail" primary CTA and
  search bar are both fully rounded, with soft diffuse shadow instead of a
  hard border.
- **Circular floating icon buttons** — mirrors the zoom/locate/layers
  controls AllTrails floats over its map; heart/save toggle is a plain white
  circle with the icon genuinely centered (see the p-0 note below).
- **Photo-first cards** — image bleeds to the card edge; a colour-coded
  status pill sits overlaid on the photo.
- **Filter chips** — horizontally-scrolling pills. Selected state stays the
  _same neutral fill_ as unselected (review: "non farla colorata, mettila al
  default") — marked only by bold weight + a check icon, not a colour swap.
- **Bottom-sheet-first overlays** — "Add to list" opens as a sheet with a
  rounded top and a drag handle, matching how AllTrails handles nearly every
  mobile action instead of a centered dialog.

### B — Ridge

Same AllTrails DNA, recomposed with our forest/warm-neutral palette and
Space Grotesk display type, pushed toward a more structured, bordered
"trail-blaze" language instead of soft pills:

- **Bordered buttons & inputs** — `rounded-xl`/`rounded-lg` with a 2px
  border instead of a shadow-driven pill; uppercase display-font labels,
  closer to trail signage than a rounded app chrome.
- **Structured cards** — `border-2`, no shadow; the photo gets a hard
  bottom border instead of bleeding into a soft-shadowed card.
- **Blaze-marker badges** — status pills become bordered, square-cornered
  chips (`rounded-md`) rather than full pills — same green-only scale as A,
  severity conveyed by depth, no red.
- **Centered dialog, not a sheet** — "Delete find" stays a classic centered,
  bordered modal. Put next to A's sheet-first "Add to list," this is the
  concrete decision point for the Sheet-vs-Dialog question raised in the
  Overlays section of the page.

## Content

Sample data is real domain content (Chanterelle / Morel / Chicken of the
Woods, edibility instead of hiking difficulty, "Log a find" instead of
"Log a hike") pulled from `SpeciesPage.tsx`'s existing patterns and the
species image assets already in the repo — not Lorem ipsum standing in for
a hiking app.

## Observed while building this (not fixed here — out of scope)

- **Don't build Tailwind class names via template-literal interpolation.**
  First pass at the green palette used a `` `bg-[${green[500]}]` `` helper —
  Tailwind's JIT scanner greps _source_ files for complete, literal class
  strings; it can't see what a template literal resolves to at runtime, so
  every one of those classes silently never got generated. The visual
  symptom was confusing (buttons falling back to whatever else touched
  `background-color`, not to "unstyled") because of the next point:
- `Checkbox`, `RadioGroupItem`, and `Switch` all render larger than their
  `size-4`/`w-8` utility classes ask for — traced to a generic
  `button { padding: 0.6em 1.2em; background-color: var(--muted); ... }`
  rule in `src/styles/globals.scss` (a leftover Vite-template reset, in
  `@layer base` with no scoping class) that applies to every native
  `<button>`, including Radix's `role="checkbox"/"radio"/"switch"`
  elements — and, harmlessly once real utility classes are generated, to
  every Button/Badge here too (Tailwind's `@layer utilities` normally wins
  over `@layer base` regardless of specificity, which is exactly why the
  broken-interpolation classes above had nothing to win _with_). Still
  visible on Checkbox/RadioGroup/Switch in the "Log a find" form section.
  Site-wide blast radius — belongs in its own bugfix ticket, not this one.

## Capturing the decision

Once a direction (or a mix) is picked in review: fold the chosen `recipes.ts`
classes into the real atoms in `src/components/ui/*` on a normal branch off
main, then delete `src/prototypes/atoms-213/` and the `/atoms-213` route.
This prototype branch (`213-atom-library-redesign-alltrails-inspired`) stays
as the primary source for _why_ — link back to it from the implementation
issue/commit.
