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

A close mapping of AllTrails' actual chrome onto our species-card domain:

- **Pill buttons & search** — AllTrails' "Hit the Trail" primary CTA and
  search bar are both fully rounded, with soft diffuse shadow instead of a
  hard border.
- **Circular floating icon buttons** — mirrors the zoom/locate/layers
  controls AllTrails floats over its map.
- **Photo-first cards** — image bleeds to the card edge; a colour-coded
  status pill (their difficulty badge, green/amber/red) sits overlaid on the
  photo; a heart/save toggle sits in the opposite corner as a translucent
  circular button.
- **Filter chips** — horizontally-scrolling, fully-rounded, filled when
  selected — AllTrails' filter row above trail results.
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
  chips (`rounded-md`) rather than full pills — still colour-coded
  green/amber/red.
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

- `Checkbox` (`src/components/ui/checkbox.tsx`) builds its className via
  `cn(checkboxVariants({ className }))` — `className` is passed as a cva
  _variant_ key instead of a second arg to `cn`, so a caller's `className`
  prop is silently dropped. Doesn't block this prototype (neither direction
  needed to reshape Checkbox), but worth a one-line fix separately.
- `Checkbox`, `RadioGroupItem`, and `Switch` all render ~40×21px in this
  app regardless of their `size-4`/`w-8` utility classes — traced to a
  generic `button { padding: 0.6em 1.2em; ... }` rule in
  `src/styles/globals.scss` (a leftover Vite-template reset with no scoping
  class) that applies to every native `<button>`, including Radix's
  `role="checkbox"/"radio"/"switch"` elements. Visible in the "Log a find"
  form section in both variants above. Site-wide blast radius — belongs in
  its own bugfix ticket, not this one.

## Capturing the decision

Once a direction (or a mix) is picked in review: fold the chosen `recipes.ts`
classes into the real atoms in `src/components/ui/*` on a normal branch off
main, then delete `src/prototypes/atoms-213/` and the `/atoms-213` route.
This prototype branch (`213-atom-library-redesign-alltrails-inspired`) stays
as the primary source for _why_ — link back to it from the implementation
issue/commit.
