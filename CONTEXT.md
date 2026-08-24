# funges

A React/Vite/Tailwind foraging map PWA. This glossary currently covers the design-system vocabulary settled while inventorying `src/components/ui/*` for elevation/glass adoption (`lodist/funges#201`); other domain areas (species, routes, forecasting) can grow here under their own subheadings as they get grilled.

## Language

### Design system — elevation & glass

**Elevation level**:
One of four semantic surface roles — `base`, `raised`, `floating`, `overlay` — that determines how a component's shadow and depth cues read, chosen by role rather than by picking a raw shadow value.
_Avoid_: shadow depth, shadow tier, z-index level

**Base**:
The elevation level for the map canvas itself — no shadow, no glass. Not a "surface" in this system's sense.

**Raised**:
The elevation level for small, static, fixed-size chrome that sits above the base surface without floating free of it (e.g. a card, the app sidebar, the mobile bottom nav bar — persistent primary nav, not dismissed by tap-outside, so it doesn't qualify as Floating despite visually sitting over the map).

**Raised-subtle**:
A quieter variant of Raised for lightweight input chrome (e.g. a search field, a select trigger) — chrome you look through rather than press; no hover escalation.

**Floating**:
The elevation level for dismiss-by-tap-outside surfaces that appear above other content and can be dismissed independently of it (e.g. a menu, a sheet, a tooltip).

**Overlay**:
The elevation level for blocking surfaces with a scrim that must be explicitly dismissed (e.g. a modal dialog).

**Glass**:
An opt-in translucent, blurred treatment layered on top of an elevation level — never a replacement for one. Restricted to `raised`/`floating` chrome that is small, fixed-size, and not text-heavy; never applied to `base` or `overlay`.
_Avoid_: backdrop blur, frosted, liquid glass (the last is the Apple design language this is _inspired by_, not implementing)

**Glass-regular**:
The glass variant for chrome sitting over text content or the map (e.g. an info card floating over the map).

**Glass-clear**:
The more-transparent glass variant, reserved for full-bleed media backgrounds; never used over text content.

**Note — `variant='floating'` naming collision**: shadcn's `Sidebar` component takes a `variant='floating'` prop — a layout/shape API (rounded corners, inset from the viewport edge). It is unrelated to this glossary's elevation-level **Floating** term above. `AppSidebar` uses shadcn's `variant='floating'` prop but its elevation level is **Raised**.

### Design system — navigation & chrome

Settled while deciding the nav/chrome paradigm for `src/components/Sidebar/` and `src/components/Mobile/MobileNavbar.tsx` (`lodist/funges#196`).

**Relevance-based disclosure**:
Showing or hiding nav items based on platform/feature context (e.g. mobile vs. desktop, an offline-features flag) rather than always rendering the full item set. Names an existing pattern already in `AppSidebar`/`MobileNavbar`, not a new mechanism introduced by #196.

**Section-adaptive accent**:
The active nav item's own tint (icon/label color, and scale on mobile) reflecting the current section — scoped to the active-item indicator only.
_Avoid_: ambient/background retinting of the whole nav per section — considered and rejected (risks inconsistency and WCAG contrast issues); out of scope for #196.
_Note_: on `MobileNavbar` the tint needs a dark-mode step (`--happy-500` rather than `--happy-700`). The `--happy-*` scale is light-mode only, and `--happy-700` over the translucent dark surface falls to 1.7:1 against a light map — under WCAG 1.4.11's 3:1 floor. `AppSidebar` needs no equivalent: its accent rides on `--sidebar-accent-foreground`, which is already redefined per theme.

**Shared nav surface**:
Both nav surfaces are elevation level **Raised** with **Glass-regular**. The class names live in one place — `NAV_SURFACE_CLASS` in `src/lib/nav-surface.ts` — which `AppSidebar` (via `Sidebar`'s `surfaceClassOverride` prop) and `MobileNavbar` both consume, so the two platforms' chrome can't drift apart. `src/test/nav-surface.test.ts` guards the constant against naming a utility `globals.scss` no longer defines.
_Note_: on `Sidebar` the treatment has to land on the painted surface (`data-slot='sidebar-inner'`), not the positioning container that `className` targets — the surface's own background otherwise paints over it. That was the bug in the hand-rolled `bg-background/95 backdrop-blur` this replaced.
