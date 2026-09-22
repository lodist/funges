/**
 * The single place the nav chrome's surface treatment is spelled out.
 *
 * `AppSidebar` (desktop) and `MobileNavbar` (mobile) are both elevation level
 * **Raised** with **Glass-regular** applied — see the design-system glossary in
 * `CONTEXT.md`. Neither is *Floating* in the elevation sense: that level is
 * reserved for dismiss-by-tap-outside surfaces (menus, sheets, tooltips), and
 * both of these are persistent primary nav even though the mobile bar visually
 * sits over the map.
 *
 * The two consume this constant instead of each spelling the classes out so
 * that the platforms' chrome can't silently drift apart. The utilities
 * themselves are defined in `src/styles/globals.scss` (#200); this only names
 * them.
 */
export const NAV_SURFACE_CLASS = 'elevation-raised glass-regular';

/**
 * Apple-only exception to the above: `MobileNavbar` swaps to this on Apple
 * mobile devices (iPhone/iPadOS), detected via `useIsAppleMobile` /
 * `isAppleMobileDevice` in `src/lib/platform.ts` — never via `@supports` or
 * `@media` alone, since Android and desktop browsers also support
 * `backdrop-filter` and must keep the cross-platform Glass-regular look.
 *
 * CONTEXT.md's Glass entry says the design system is "inspired by" Apple's
 * Liquid Glass, not implementing it, as a deliberate cross-platform stance.
 * This constant is a scoped, explicit carve-out from that stance for the
 * mobile nav bar only — `AppSidebar` never picks it up.
 */
export const NAV_SURFACE_CLASS_LIQUID = 'elevation-raised glass-liquid';
