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
The elevation level for small, static, fixed-size chrome that sits above the base surface without floating free of it (e.g. a card, the app sidebar).

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
