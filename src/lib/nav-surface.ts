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
