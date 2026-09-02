---
target: src/components/SpeciesSelector.tsx
total_score: 19
max_score: 40
na_heuristics:
p0_count: 3
p1_count: 2
timestamp: 2026-09-02T13-56-44Z
slug: src-components-speciesselector-tsx
---

Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                                                                                                      |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Visibility of System Status     | 2         | Resting readout is excellent; but no `aria-expanded`, the open-state wash reads ~1.1:1 as a fill, and in dark mode hover renders the species name at 1.04:1.                                                                   |
| 2         | Match System / Real World       | 3         | Photo + common name + italic binomial is the field-guide convention, correctly ranked. Docked for emoji-as-category-icon and `bg-black/10` dulling the photo.                                                                  |
| 3         | User Control and Freedom        | 2         | Escape closes the panel, but focus lands on `<body>`, and no code path clears a selection — the map is permanently filtered to one organism.                                                                                   |
| 4         | Consistency and Standards       | 1         | `select`/`dropdown-menu`/`sheet`/`dialog` all exist and are all bypassed; four hand-rolled shadows; hand-rolled glass. The sibling "Map theme" button in the same overlay exposes `haspopup="menu"`; this one exposes nothing. |
| 5         | Error Prevention                | 2         | Picking wrong is cheap to reverse. Docked because 12 of 33 species are silently unofferable and offline leaves every tile dead.                                                                                                |
| 6         | Recognition Rather Than Recall  | 3         | Photo-first at both scales, no memory required. The strongest thing here and the reason the component half-works.                                                                                                              |
| 7         | Flexibility and Efficiency      | 2         | Search + `autoFocus` is real work. No Enter-to-commit, no arrow-key grid nav, 21 sequential tab stops, no recents despite the store already persisting.                                                                        |
| 8         | Aesthetic and Minimalist Design | 2         | The trigger is handsome and densely informative. The panel is louder than the terrain it covers.                                                                                                                               |
| 9         | Error Recovery                  | 1         | The empty state ships a hardcoded Italian sentence to all six locales — and it is the state 12 real species land in.                                                                                                           |
| 10        | Help and Documentation          | 1         | No panel title, no `aria-label`, no `role`. The one string written for this control never renders. Nothing says identification ≠ edibility.                                                                                    |
| **Total** |                                 | **19/40** | **Poor — major UX overhaul required**                                                                                                                                                                                          |

All ten heuristics apply: this is app UI on the field surface, not a Persuade or Experience page.

## Design Specificity Verdict

**Split, and the split is the finding: the 64px trigger is authored for Fung.es. The panel it opens is another product's design language grafted on 4px away from it.**

The resting tile (`SpeciesSelector.tsx:69-100`) is this product and nothing else — a 48px photograph, a vernacular name, an italic binomial ranked beneath it. A field-guide entry rendered at chrome scale, floating on terrain. It also gets the hard part right: `text-foreground` on `bg-card/95` holds the species name at a measured **15.16:1 light / 9.69:1 dark** regardless of what the map is doing underneath. That is The Trailhead's thesis executed rather than described.

Then you press it, and the product changes hands. `SpeciesSelectorFullscreen.tsx:130` is `fixed inset-0 bg-black/15 backdrop-blur-lg`, and everything on it is raw white: `text-white/60` (`:184`, `:202`), `bg-white/20` (`:144`), `bg-white/3` (`:191`), `bg-white` vs `bg-white/90` as the entire selected/unselected signal on the filter chips (`:171-176`). Every one is the named opposite of a rule this repo enforces at build time — The Warm Ground Rule (no cool grey, no pure white, warm paper in _both_ themes), The Glass Scope Rule (never glass on a blocking, text-heavy surface). Hue 150 appears in the panel's chrome exactly once, as a 32px dot at `:257`.

The two languages sit adjacent, not sequential: the grid tiles themselves (`:245`, `:288`) are correct — `bg-card`, `rounded-card`, Ink on warm paper. So the user sees 21 Fung.es cards laid on a surface from a different app, which is worse than a uniformly generic panel, because the contrast makes the foreign body legible as one.

**Deterministic scan.** The detector returns **0 findings, exit 0** on both `SpeciesSelector.tsx` and `SpeciesSelectorFullscreen.tsx`. That is not a clean bill of health — it is a statement about reach, and the same is true of the guard suite. `npx vitest run` on `palette` / `radius` / `border` / `touch-target` passes **34/34**, and three of the four cannot see this file by construction:

- `touch-target.test.ts` matches only `size=['"](xs|sm)['"]` and `<Button className="h-N">`. This component uses a raw `motion.button`, so its sub-floor values are invisible to the 44px guard.
- `palette.test.ts` reads only `src/index.css`. No component file is scanned.
- `radius.test.ts`'s arbitrary-value scan is keyed to spacing prefixes, so `min-h-[32px]` and `shadow-[0_2px_10px_rgba(0,0,0,0.18)]` fall outside it.
- `border.test.ts`'s `transition-all` assertion is scoped to `src/components/ui/button.tsx`; this file ships `transition-all` on both branches (`:56`, `:108`).

No exemption anywhere names `SpeciesSelector`. It simply sits outside every net.

`AdvancedMap.tsx` returns 4 findings (exit 2), all one advisory rule — `design-system-color` on `#fff7e6`, `#e8d7a5` (`:703`), `#b38a3c`, `#fff9eb` (`:723`). Real, but they are `route-to-dish` marker `innerHTML` templates 250+ lines from this component's call site at `:976`. Not attributable here.

The one deterministic signal that _is_ about this component is the sharpest in the run: `impeccableCollectVisualContrastCandidates()` returned **exactly two candidates on the entire page, and both are inside `SpeciesSelector`** — the `h3` species name and the `p` binomial, each flagged `reasons: ["backdrop filter", "canvas underlay"]`, threshold 4.5, and each returning `status: "unresolved", reason: "backdrop filter needs screenshot pixels"`. The detector pointed precisely at the pair it could not measure. Pixel sampling then measured it, and found the worst result on the surface (P0-1 below).

**False positives for this target.** `flat-type-hierarchy`, `layout-transition` ("transition: width") and `shape-assembled-illustration` all fired page-level (`selector: "body"`, `isPageLevel: true`); a scoped re-run ignored the root and returned the same set. Enumerating all 556 elements with a layout-affecting transition found **zero** with `width` explicitly — the SpeciesSelector button has `transition-property: all`. The independently measured fact stands on its own merits: `transition-all` at 200ms sits on a box whose width is content-driven and does change (144.32 → 177.87 → 258.12px).

**Visual overlays.** Injection succeeded — `document.title` was mutable, an inline `<script>` executed, the live server served `detect.js` (428,885 bytes) on port 8400, and the detector ran in the page. **No user-visible overlay was rendered**; the findings above came back through the console only. Both the live server and the dev server were stopped and verified down.

**A's counts were wrong, and the real number is a defect.** A reported 33 tiles throughout. `getSpeciesOptions()` filters on `showOnMap`, and 12 of 33 entries omit that field entirely — so the picker offers **21**. B's accessibility snapshot counted 28 controls in the open panel, which is exactly 21 tiles + 5 chips + search + close. Independent confirmation, and the subject of P0-2.

## Overall Impression

The information model is right and the execution is unfinished. Someone understood that a species picker on a foraging map should be a field-guide card floating over terrain, and built that — then wired it up with a hand-rolled button, a hand-rolled overlay, and none of the four shipped primitives that would have supplied the dialog semantics, the focus management, the touch floor and the theme-aware states for free.

The single biggest opportunity is not visual. It is that **this component is 90% replaceable by `sheet.tsx` plus the existing tokens**, and doing that swap fixes the dialog semantics, the focus trap, the focus restore, the glass fallbacks and the dark-mode state colours in one move — leaving you free to spend real design attention on the one thing only you can decide: whether this is a single-select picker at all.

## What's Working

1. **The trigger's information model is the product.** `SpeciesSelector.tsx:71-99` — 48px photograph, vernacular name, italic binomial _beneath_ it. That rank order is correct for an amateur audience, and it is unmistakably Fung.es. Nothing else in the component earns this.
2. **It solves the hardest contrast problem on this surface correctly.** `text-foreground` on `bg-card/95` (`:56`, `:91`) means a 95%-opaque ground shifts the effective backdrop by at most 5%, so the species name measures **15.16:1** in light and **9.69:1** in dark over any tile the map can produce — verified across three of the app's own map themes. This is precisely what The Trailhead asks of chrome, and it is why the trigger stays legible where the panel does not.
3. **The disclosure shape is right.** 64px tile → full-viewport browse (`:52` → `:138`) is the correct answer for a 21-option control on a map that owns the screen; a dropdown would have been worse. The panel's search → filter → grid banding is legible and well proportioned. Every problem below is in the execution of a correct idea.

## Priority Issues

### [P0] Dark-mode hover makes the species name invisible — 1.04:1

**What.** `hover:bg-happy-50/95` (`SpeciesSelector.tsx:56`, `:108`) resolves to `232/251/235` — a near-white mint — in **both** themes, because per DESIGN.md's Light-Tuned Scale Rule the `--happy-*` steps are absolute and are not theme-swapped. The text stays `--foreground`, which in dark is `238/236/229`. Measured on the composited pixels: the `h3` species name reads **1.04:1** and the `p` binomial **1.36:1**. Confirmed twice — pixel sampling of the glyph region against the hovered fill, and a screenshot in which the name is simply not there.

**Why it matters.** This is the shipped branch, in a first-class theme, in the state a pointer produces by resting on the control. The one string this component exists to display disappears on hover. It is also the exact defect DESIGN.md's Light-Tuned Scale Rule was written to prevent — "anything that needs to work in both themes reads a semantic token instead" — and it is invisible in light mode, which is why it shipped.

**Fix.** Replace `hover:bg-happy-50/95` with a theme-aware pair. `--secondary` / `--secondary-foreground` (Moss, 4.63:1) or `--accent` / `--accent-foreground` (Trail Tan, 9.22:1 in dark) both have real dark values; or drop the fill change entirely and let the shipped `.elevation-interactive` hover escalation carry the feedback, which is what The Role-Not-Value Rule intends. Then measure the hover state in dark before trusting light mode — the Same-In-Light Rule already names this trap for the destructive pair.

**Suggested command**: `/impeccable audit`

---

### [P0] 12 of 33 species cannot be selected, and searching for one answers in Italian

**What.** `getSpeciesOptions()` (`src/data/species.ts:449`) is `SPECIES_DATA.filter(({ showOnMap }) => showOnMap)`. Twelve entries omit `showOnMap` entirely, so `undefined` filters them out: **blackberry, elderberry, hazelnut, chicken-of-the-woods, oyster-mushroom, shiitake, blueberry, wild-mint, plantain, elderflower, daisy, violets**. The panel iterates `speciesOptions` (`SpeciesSelectorFullscreen.tsx:87`), so it offers 21 of 33 — confirmed by the a11y tree's 28 panel controls.

Search a missing one and you reach the empty state, where `SpeciesSelectorFullscreen.tsx:203-206` supplies `'Nessuna specie trovata con questo nome'` as the fallback for `t('species.noResultsDescription')`. `t` is the **`map`** namespace, and `map.json`'s `species` object holds only `select, search, clear, noResults, notAvailableOffline` — verified in all six locales. The key does not exist, so **every user in every locale, English included, reads Italian.**

**Why it matters.** The missing twelve include some of the most recognisable foraging targets in the catalogue — chicken-of-the-woods, oyster mushroom, blackberry, elderberry, hazelnut. A user who came to the app _for_ chicken-of-the-woods searches for it, finds nothing, and is told so in a language they probably do not read. There is no signal that the species exists in the product at all. This is not a styling gap; it is 36% of the catalogue silently absent from its own picker.

**Fix.** Two parts, both small. Decide `showOnMap` explicitly for all 33 entries — if the twelve genuinely have no map layer, they still belong in the picker with a "no map data yet" state rather than being filtered out of existence, and the type should require the field so the next entry cannot omit it. Then add `species.noResultsDescription` to all six `map.json` files and delete the literal. While there: the results count at `:185` is built by concatenating `tSpecies('search.found') + count + tSpecies('search.species')`, which cannot survive German word order or Romance pluralisation — make it one interpolated ICU-plural key.

**Suggested command**: `/impeccable harden`

---

### [P0] The panel is not a dialog: no role, no name, no focus management, no heading

**What.** `SpeciesSelectorFullscreen.tsx:123-133` renders a `motion.div` at `fixed inset-0 z-60` with no `role='dialog'`, no `aria-modal`, no accessible name, no focus trap, no focus-on-open and no focus-restore. Measured with the panel open: `[role=dialog]` count **0**, `[aria-modal]` count **0**, `body` overflow **`visible`**, and the a11y tree renders the panel's 28 controls as flat siblings inside `main`, alongside the still-focusable map chrome behind them. Escape does close it — and `document.activeElement` afterwards is **`BODY`**, not the trigger. There is also no heading of any level in the panel, so the map route's entire outline is one `h3` inside a button, becoming 22 `h3`s with no `h1` or `h2` above any of them.

**Why it matters.** A screen-reader user's virtual cursor never enters the panel; it stays in the map behind, reading chrome that is visually covered. A keyboard user tabs from the close button through 5 chips and 21 tiles and straight out into the map's own controls, because nothing traps. After Escape, focus is nowhere. This is the primary action of the surface being unavailable to two personas, and it lands on WCAG 1.3.1, 2.4.3 and 2.4.6 simultaneously.

**Fix.** Use `sheet.tsx`. It exists, it is Radix-backed, and it supplies the role, the modal semantics, the focus trap, the focus restore, the scroll lock and the Escape handling for free, plus `floating-up` for a bottom-anchored panel. If the full-bleed treatment must stay hand-rolled, then take the vocabulary DESIGN.md already wrote for the map's other hand-rolled popover: declare `role` and `aria-modal`, add an `<h2 id>` with `aria-labelledby`, trap and restore focus, and give the grid `role='listbox'` with roving `tabindex` and arrow-key navigation.

**Suggested command**: `/impeccable harden`

---

### [P1] The trigger has no boundary and no working focus ring over an unpredictable photographic ground

**What.** Computed: `border-top-width: 0px`, `box-shadow: rgba(0,0,0,0.18) 0 2px 10px`. The shadow is the only perimeter, and measured against the map it darkens the ground from `69/135/146` to `66/128/138` — **1.10:1** in light, **1.01:1** in dark over Dark Matter. Nothing at the edge clears the 3:1 WCAG 1.4.11 floor, so separation rests entirely on fill-versus-ground — which itself fails in **three of six** theme × map-theme combinations: light over the White map **1.45:1**, dark over the Light map **2.95:1**, dark over Dark Matter **1.55:1**.

The focus indicator is the UA default: `outline: oklab(…) auto 1px`, `outline-offset: 0px`, `box-shadow` unchanged. The component declares no `focus-visible:` class at all; the colour arrives from the global `outline-ring/50` at `src/index.css:630`. Measured, the green band reads **1.65:1** against the map ground and **2.31:1** against the card fill — both under 3:1. `.focus-ring` (2px `--ring` on a 2px offset) ships in `globals.scss` and is not applied here.

**Why it matters.** This is the one contrast problem The Trailhead exists to solve, and DESIGN.md treats the floors as hard limits precisely "because the surface underneath is a photograph of the world." In half the theme × map-style combinations the user can actually select, the control has no measurable edge — it is a slightly different shade of the map. And a keyboard user gets a 1px ring at 1.65:1 drawn tight against a 20px corner over terrain, while the token built for this sits unused.

**Fix.** Apply `.focus-ring` and drop the reliance on the UA outline — that alone moves the indicator to `--ring` (7.85:1 light) on a 2px offset measured against the page rather than the fill. For the boundary, take `.glass-regular` instead of the hand-rolled `bg-card/95 backdrop-blur-sm`: it carries the 1px translucent border and brighter top edge that stand in for the specular highlight, plus the `prefers-reduced-transparency` and `prefers-contrast` drops to opaque that this tile currently has none of. If the measured edge still misses 3:1 over the White map, the fill needs to go fully opaque there rather than the border needing to get darker.

**Suggested command**: `/impeccable audit`

---

### [P1] The shipped trigger never says it is pressable, and the branch that would have said so is both unreachable and broken

**What.** `src/store/mapStore.ts:206` initialises `selectedSpecies` to `'mushroom'` — a real entry with `showOnMap: true` — and `setSelectedSpecies` is called at exactly two sites, both with a species code, never with `null`. So `selectedSpeciesData` is always truthy and **the entire pill branch at `SpeciesSelector.tsx:104-133` never renders.** Reaching it required forcing store state through the Vite module graph. Consequences:

- `t('species.select')` (`:46`) — "Select Species", translated into all six locales — **never renders to a single user.**
- The `ChevronDown` at `:126` never ships. **The only affordance signal in the component lives in the dead branch.**
- That branch is also broken. Its className is `justify-between … rounded-full w-72 min-h-[32px] px-3 py-1` with **no `flex` class** — computed `display: inline-block`, so `justify-between` is inert and the chevron wraps onto a second line at the left, at x=20 on mobile. The measured 288×44 box clears the touch floor only by accident of that stacking (4 + 24 + 12 + 4); `min-h-[32px]` on its own would be 12px short.

What actually ships is a 64px photo card with no chevron, no caret, no `aria-expanded`, no `aria-haspopup`, no `aria-controls` and no label — measured accessible node: `button "Boletus Boletus Boletus spp."`, with `aria-expanded: null` and `aria-haspopup: null`. The species name is announced **three times** (image `alt` + `h3` + `p`). Meanwhile the sibling `button "Map theme"` in the same overlay _does_ expose `expandable haspopup="menu"` — the app has the pattern and this control skipped it.

Separately, `:91` uses `<h3 className='text-sm'>`, and `src/index.css` sets `h1,h2,h3 { font-family: var(--font-display) }` — so the species name renders in **Space Grotesk at 14px**, where DESIGN.md's Label role is Public Sans 500 and names this exact string as the reason: Public Sans is "exactly right for a species name being read at arm's length in bad light." The wrong face arrived by choosing the wrong element, not by choosing a font.

**Why it matters.** A first-timer cannot discover the control at all: its shape, its missing chevron and its missing ARIA all say "status readout," and it is the only control on the field surface without a visible affordance — the right-hand stack are all recognisable icon buttons. A screen-reader user hears the name three times and nothing about what the control does.

**Fix.** Delete the pill branch; it is unreachable and every sub-floor value in the file lives in it. Give the surviving tile the affordance: a `ChevronDown` at `size-4` in a trailing slot, `aria-expanded={isOpen}`, `aria-haspopup='dialog'`, `aria-controls`, and `.focus-ring`. Change `<h3>` to `<span className='type-label'>` so the name renders in Public Sans and the map route stops emitting an orphan heading, and put `aria-hidden` on the decorative image so the name is announced once. Then reuse `t('species.select')` as the label prefix — "Select species: Chicken of the Woods" — so the copy written for this control finally does work.

**Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Verifying in the field** (PRODUCT.md's second moment — one hand, glare, offline, low confidence):

- Offline with no cached region, all 21 tiles go `opacity-50 cursor-not-allowed tabIndex={-1}` (`SpeciesSelectorFullscreen.tsx:248-249`) and the reason lives in a `title` attribute (`:236`) that touch never fires. The only visible marker is an 8px `bg-destructive` dot per tile (`:304-307`) — **Fly Agaric red painted on a mushroom because the map tiles are not cached**, in a product where DESIGN.md admitted hue 28 precisely because "red is the foraging world's own 'do not eat' signal." And `--destructive` is fill-only, reading 1.93:1 on a dark card, so in dark mode the misread does not even happen reliably.
- Search field 40px (`:141`, `h-10` beating the Input atom's `h-12` through tailwind-merge) and filter chips ~36px (`:171`) — both under the 44px floor, both on the surface a cold thumb has to operate.
- `text-white/60` body copy (`:184`, `:202`) over `bg-black/15 backdrop-blur-lg` over sunlit terrain. DESIGN.md's own Don'ts record `/60` at 2.42:1 against a 3:1 floor, and here the ground is unpredictable on top of that.
- Two stacked full-viewport `backdrop-blur-lg` layers (`:130`, `:191`) beneath a scrolling image grid — the scroll-jank profile, on a mid-range phone.
- Cannot clear the selection to see the whole map: no code path sets `selectedSpecies` to `null`.
- The trigger sits at `top-2 left-2`, the corner a right-handed grip reaches last.

**Planning at home** (PRODUCT.md's first moment — larger screen, calm attention, learning):

- 12 of 33 species are absent from the picker with no explanation, including the ones a beginner is most likely to have heard of.
- No recents and no favourites, though `mapStore` already persists the selection to `localStorage`.
- At `xl:grid-cols-6` the current selection is marked by a 5% scale and a white dot, and the panel neither scrolls to it nor filters to it — you re-find your own choice by eye on every open.
- Nothing tells you that the map's polygons are filtered _by_ this tile, so the causal link between "I picked Chicken of the Woods" and "the map changed colour" is left to inference.
- Measured: the selected tile is byte-identical at 390px and 1440px — 144.32 × 64, `h3` 14/17.5, `p` 12/15. There is no planning-surface treatment at all; the field control was shipped to both moments.

**Sam (screen reader / keyboard-only):**

- The panel is a `motion.div` with no `role`, no `aria-modal`, no name and no focus management. Verified: 0 `[role=dialog]`, 0 `[aria-modal]`, no trap, 28 controls flat in `main`.
- Trigger announces `"Boletus Boletus Boletus spp."` — the name three times — with no expanded state and no popup hint.
- Heading list on the map route: 22 `h3` elements and no `h1` or `h2`. Jumping by heading lands mid-control.
- Focus is never moved into the panel on open and never restored on close; after Escape, `document.activeElement === BODY`.
- 21 tiles are 21 sequential tab stops, no roving `tabindex`, no arrow keys, no Enter-to-commit from the search field.
- The focus ring is the UA default at 1.65:1 over the map, while `.focus-ring` ships unused.
- Offline is conveyed by opacity plus an unlabelled 8px dot, and `tabIndex={-1}` removes 21 items from the tab order with no announcement.

**Jordan (first-timer):**

- Never sees `t('species.select')` — the store boots to `'mushroom'`, so the explanatory copy is unreachable.
- The shipped tile has no chevron, no caret, no ARIA, no label. It reads as a readout.
- The panel has no title, so on arrival nothing says what the screen is for.
- Searching for a species that exists in the catalogue but not in `speciesOptions` returns Italian.
- Nowhere in the flow does the product say a species layer is a likelihood surface rather than a safety judgment — the caveat PRODUCT.md treats as central, absent from the screen where the user commits to a species.

## Minor Observations

**Consolidated [P2] — systematic bypass of the shipped design system.** Individually P2/P3; together they are the specificity verdict's evidence, and every one is a rule this repo enforces in a suite that cannot see this file:

- **Four hand-rolled shadows** against The Role-Not-Value Rule — `shadow-[0_2px_10px_rgba(0,0,0,0.18)]` (`SpeciesSelector.tsx:56`, `:108`), and at `SpeciesSelectorFullscreen.tsx:245`, `:251-252`, `:257`. Note that `0 2px 10px / 0.18` matches **no** role — it sits between `raised` and `floating` and belongs to neither — while `:245` and `:251-252` reproduce `raised-hover` and `raised` byte-for-byte. Someone read the tokens and typed the values out.
- **Hand-rolled glass** — `bg-card/95 backdrop-blur-sm` instead of `.glass-regular`. `CONTEXT.md` records the identical `bg-background/95 backdrop-blur` as the bug `NAV_SURFACE_CLASS` exists to prevent. The real cost is the missing `@supports` block: a user who asked their OS for reduced transparency or more contrast gets blur anyway.
- **Five `scale` transforms** against The Weight-Not-Movement Rule, whose sanctioned exceptions are two and neither is this — `whileHover`/`whileTap` on both branches, `hover:scale-105 active:scale-95` (`:247`), `group-hover:scale-110` on the tile image (`:266`, compounding to 1.155×), and `scale-105` as a **persistent selected state** (`:251`), which in a `gap-4` grid overlaps neighbours by ~3.5px and breaks row alignment.
- **`focus:ring-white/20`** (`:144`) sets a ring colour with no ring width — it renders nothing. And it is `focus:`, not `focus-visible:`, which `globals.scss` explicitly calls out.
- **Two dead motion APIs.** The `layoutId`s do not match — `'species-selector-button'` (`SpeciesSelector.tsx:60`, `:112`) vs `'species-selector'` (`SpeciesSelectorFullscreen.tsx:124`) — so the shared-layout morph the author plainly intended never runs in either direction. And `AnimatePresence` (`SpeciesSelector.tsx:137`) wraps a child that is **always mounted** — the `isOpen` gate lives inside it at `SpeciesSelectorFullscreen.tsx:120` — so `exit={{ opacity: 0, scale: 0.8, y: 20 }}` never plays. The panel enters with a considered 200ms rise and vanishes in one frame, which is the peak-end moment of the whole interaction.

**Other:**

- **`truncate` is inert on the trigger, and the collision risk is real but unreproduced.** `:57` has no `width` and no `max-width`, and the wrapper is `w-auto`, so `truncate` on `:91`/`:94` has no definite width to clip against: measured, `scrollWidth === clientWidth` at every size and the box simply grows — 144.32px ("Boletus") → 177.87 ("Common Sorrel") → **258.12** ("Gewöhnlicher Sauerampfer"). At 390px the German tile still leaves 63.88px to the right-hand control column, so **no collision was reproduced**; the risk lives at `globals.scss`'s 320px `min-width` floor and is derived, not measured. Cap it anyway — `max-w-[min(18rem,calc(100vw-5.5rem))]` — because `transition-all` at 200ms is on that box and currently animates `width` on every species change.
- **`document.body.style.overflow = 'unset'`** (`SpeciesSelectorFullscreen.tsx:64`) permanently defeats The Fixed Shell Rule. `globals.scss:23` sets `overflow: hidden`; an inline `unset` computes to `visible` and outranks the stylesheet, so after the first open/close the app shell can scroll as a document for the rest of the session. Measured: `body` overflow is `visible` with the panel open. Restore the prior value, or toggle a class.
- **`bg-black/10` over the species photo** (`SpeciesSelector.tsx:86`, `SpeciesSelectorFullscreen.tsx:281`): no text sits on it, so it is not a legibility scrim. It costs ~10% of the luminance and the saturation punch of the one asset the product's whole recognition strategy rests on, read outdoors where the screen is already losing to the sun. If it exists to normalise exposure across photos, that belongs in the asset pipeline.
- **The emoji fallback is unreachable, twice over.** `getSpeciesImage` returns a constructed URL unconditionally and every id has a matching `.webp`, so `SpeciesSelector.tsx:81-85` is dead — and a genuinely missing asset would render a broken image, not the emoji, because there is no `onError`.
- **The one way to see the pill branch shows a raw i18n key.** A stale `localStorage` species code makes `find` return `undefined`, the pill renders, and `tSpecies('list_of_species.<stale>.name')` returns the key string itself. Another reason to delete the branch and validate the persisted value.
- **The "checkmark badge" has no checkmark.** The comment at `SpeciesSelectorFullscreen.tsx:243` says "corner checkmark badge"; `:257-258` renders a 32px green circle containing a 12px white dot. A dot reads as an indicator light; a checkmark reads as _chosen_. This is the panel's primary confirmation signal and it says the wrong word.
- **Weight-only selected state, misapplied.** The comment at `:167-169` cites the no-colour-swap idea to justify the filter chips' weight-only selection, but The Quiet-Child-Uses-Weight Rule governs a secondary child _inside_ a stateful row so it does not fight the row's own state colour. It does not license removing the state signal from the control itself. `bg-white` vs `bg-white/90` plus one font weight, over a blurred photograph, is not a state.
- **A 64px `Search` icon** in the empty state (`:200`) sits outside the six-size icon system DESIGN.md documents.
- **`bg-secondary bg-secondary`** duplicated at `:265`. **`species.clear`** ships in all six locales and is called by nothing. The outside-click listener (`SpeciesSelector.tsx:26-38`) stays mounted whether or not the panel is open and is redundant against a full-viewport overlay that has its own backdrop — a `Sheet` removes it entirely.
- **PRODUCT.md says 34 species entries; the data has 33.** Doc drift, reported not fixed.
- **Console is clean:** 0 errors. The 4 warnings are MapLibre style issues (`citydot` sprite, a null numeric) unrelated to this component.

## Questions to Consider

1. **If the panel's tiles are already warm paper with Ink text, what is the black glass for?** The grid works; the chrome around it is the foreign body. What happens if the panel's ground becomes Field Paper and its chrome becomes the same `.glass-regular` the nav already shares through `NAV_SURFACE_CLASS` — does the panel stop being a second design language, and does the trigger-to-panel transition suddenly have somewhere to go?
2. **Should this be a picker at all, or a filter?** Every symptom above descends from modelling "which species am I looking for" as a single-select: 21 flat options, no way to clear, the map permanently showing one organism, a selection you re-find on every open, a trigger that reads as a readout because that is largely what it is. Foragers go out for what is in season, not for one thing. What does this surface look like as a **multi-select seasonal filter** whose resting chrome is a count and whose panel opens sorted by what is fruiting now? The scoring data that answers "worth foraging now" already exists.
3. **What is the trigger for, in the field?** At home it is a picker. Outdoors, one-handed, the same 64px card is much more plausibly a _readout_ of what the map is showing — which is how it behaves and why it has no affordance. If that is true, the field version belongs as a bottom sheet in the thumb zone, not at `top-2 left-2`. Has the trigger's _position_ ever been tested against the field moment, rather than its styling?
4. **Where does "this is not an edibility judgment" live?** Right now, nowhere in this flow. The user commits to hunting a named organism and the interface has no opinion. If that sentence belongs anywhere it belongs on the confirmation — the moment the tile updates. What would it cost to let the trigger's second line, currently a truncated binomial nobody can read at 12px italic in glare, carry it instead?
