import { Link, useLocation } from '@tanstack/react-router';
import {
  LayoutGrid,
  Map,
  CalendarRange,
  ChefHat,
  Database,
  Settings as SettingsIcon,
  ScanSearch,
  Sprout,
} from '@/lib/icons';
import { currentSpace, visibleSpaces } from '@/lib/spaces';
import { SpaceNavButton } from '@/components/SpaceSwitcher';
import { IDENTIFY_PATH, isIsolatedPath } from '@/lib/isolation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsAppleMobile } from '@/hooks/use-apple-mobile';
import { NAV_SURFACE_CLASS, NAV_SURFACE_CLASS_LIQUID } from '@/lib/nav-surface';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { DURATION_SLOW, EASE_STANDARD } from '@/lib/motion';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';

const basePath = import.meta.env.BASE_URL || '/';

/**
 * Section-adaptive accent: the active item's own tint, per CONTEXT.md.
 *
 * The `--happy-*` scale is light-mode only (see the note on it in index.css),
 * so dark mode steps up to `--happy-500`. It has to: `--happy-700` over the
 * translucent dark surface bottoms out at 1.7:1 against a light map, under WCAG
 * 1.4.11's 3:1 floor for non-text contrast. `--happy-500` holds 5.9:1 at its
 * worst. Exported so the test asserts the accent rather than a copied string.
 */
export const ACTIVE_ACCENT_CLASS = 'text-happy-700 dark:text-happy-500';
const INACTIVE_ACCENT_CLASS =
  'text-muted-foreground hover:text-happy-700 dark:hover:text-happy-500';
// Six items is the ceiling: at the 320px minimum width a seventh falls under
// the 44px touch floor. Identify holds the thumb's slot because it is the
// field action; Data, a planning page, lives in the Settings hub on phones.
const items = [
  { url: `${basePath}map`, icon: Map },
  { url: `${basePath}worth-foraging-now`, icon: CalendarRange },
  // A fresh document, not a route change: /identify is served with its own
  // headers (lib/isolation).
  { url: IDENTIFY_PATH, icon: ScanSearch, reloadDocument: true },
  { url: `${basePath}recipes`, icon: ChefHat },
  { url: `${basePath}species`, icon: Database },
  { url: `${basePath}settings`, icon: SettingsIcon },
];
// Huerta's own pages; the hub (Settings) is shared and holds the switcher.
const huertaItems: typeof items = [
  { url: `${basePath}huerta`, icon: Sprout },
  { url: `${basePath}huerta/year`, icon: CalendarRange },
  { url: `${basePath}huerta/planner`, icon: LayoutGrid },
  { url: `${basePath}huerta/map`, icon: Map },
  { url: `${basePath}settings`, icon: SettingsIcon },
];
interface MobileNavbarProps {
  hidden: boolean;
}

export default function MobileNavbar({ hidden }: MobileNavbarProps) {
  const isMobile = useIsMobile();
  const isAppleMobile = useIsAppleMobile();
  const location = useLocation();

  if (!isMobile) return null;

  return (
    <motion.nav
      // Raised + Glass-regular, shared with AppSidebar (#196) — except on
      // Apple mobile (iPhone/iPadOS), which gets the Liquid Glass surface
      // and a pill shape instead (`rounded-full` clamps to a stadium shape
      // on a rectangle this short, matching the iOS 18+ tab bar). See
      // NAV_SURFACE_CLASS_LIQUID in nav-surface.ts for why this is scoped
      // to Apple only and not every backdrop-filter-capable browser.
      // Carried on the animated element itself rather than an inner
      // wrapper: a backdrop-filter nested inside a transformed ancestor
      // samples the wrong region in Safari.
      className={cn(
        'fixed bottom-4 left-4 right-4 z-10',
        isAppleMobile ? 'rounded-full' : 'rounded-card',
        isAppleMobile ? NAV_SURFACE_CLASS_LIQUID : NAV_SURFACE_CLASS
      )}
      initial={{ y: 0 }}
      animate={{ y: hidden ? 120 : 0 }}
      // Motion (#225): was a spring with `duration: 0.3` beside it, which
      // framer-motion discards whenever stiffness/damping are set — measured
      // settle time was ~500ms, not the 300ms the comment promised. A tween
      // is what actually rides --transition-duration-slow.
      transition={{ duration: DURATION_SLOW, ease: EASE_STANDARD }}
    >
      <ul className='flex justify-around items-center py-3 px-3'>
        {/* First slot: the space switch, a grey squirrel that opens the colour
            tiles (only while there is more than one space). */}
        {visibleSpaces().length > 1 && (
          <li className='flex-1'>
            <SpaceNavButton
              className={cn(
                'flex w-full items-center justify-center rounded-xl px-1 py-2 transition-all duration-base',
                INACTIVE_ACCENT_CLASS
              )}
            />
          </li>
        )}
        {(currentSpace(location.pathname) === 'huerta'
          ? huertaItems
          : items
        ).map(item => {
          const isActive =
            item.url === `${basePath}settings`
              ? location.pathname.startsWith(`${basePath}settings`) ||
                (shouldShowOfflineFeatures &&
                  location.pathname === `${basePath}offline`) ||
                location.pathname === `${basePath}data` ||
                location.pathname === `${basePath}instructions` ||
                location.pathname === `${basePath}support` ||
                location.pathname === `${basePath}impressum` ||
                location.pathname === `${basePath}privacy-policy` ||
                location.pathname === `${basePath}termsuse`
              : item.url === IDENTIFY_PATH
                ? isIsolatedPath(location.pathname)
                : location.pathname === item.url;
          const Icon = item.icon;
          return (
            <li key={item.url} className='flex-1'>
              <Link
                to={item.url}
                reloadDocument={item.reloadDocument}
                // Section-adaptive accent is tint + scale only, so without
                // this the active section is conveyed by colour alone.
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-base ${
                  isActive ? ACTIVE_ACCENT_CLASS : INACTIVE_ACCENT_CLASS
                }`}
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  animate={isActive ? { scale: 1.2 } : { scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                  }}
                >
                  <Icon className='h-6 w-6' />
                </motion.div>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
