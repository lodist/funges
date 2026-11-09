import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon } from '@/lib/icons';
import { currentSpace, visibleSpaces } from '@/lib/spaces';
import { SpaceNavButton } from '@/components/SpaceSwitcher';
import { IDENTIFY_PATH, isIsolatedPath } from '@/lib/isolation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsAppleMobile } from '@/hooks/use-apple-mobile';
import { NAV_SURFACE_CLASS, NAV_SURFACE_CLASS_LIQUID } from '@/lib/nav-surface';
import { navItems } from '@/lib/nav-items';
import { cn } from '@/lib/utils';
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
interface MobileNavbarProps {
  hidden: boolean;
}

export default function MobileNavbar({ hidden }: MobileNavbarProps) {
  const isMobile = useIsMobile();
  const isAppleMobile = useIsAppleMobile();
  const location = useLocation();
  const { i18n } = useTranslation();

  if (!isMobile) return null;

  return (
    <nav
      // Raised + Glass-regular, shared with AppSidebar (#196) — except on
      // Apple mobile (iPhone/iPadOS), which gets the Liquid Glass surface
      // and a pill shape instead (`rounded-full` clamps to a stadium shape
      // on a rectangle this short, matching the iOS 18+ tab bar). See
      // NAV_SURFACE_CLASS_LIQUID in nav-surface.ts for why this is scoped
      // to Apple only and not every backdrop-filter-capable browser.
      // Carried on the animated element itself rather than an inner
      // wrapper: a backdrop-filter nested inside a transformed ancestor
      // samples the wrong region in Safari.
      // It steps aside on a CSS transition (the global reduced-motion rule
      // settles it at once): motion here put its animation engine in the
      // entry chunk every page loads.
      className={cn(
        'fixed bottom-4 left-4 right-4 z-10 transition-transform duration-slow ease-standard',
        hidden && 'translate-y-[120px]',
        isAppleMobile ? 'rounded-full' : 'rounded-card',
        isAppleMobile ? NAV_SURFACE_CLASS_LIQUID : NAV_SURFACE_CLASS
      )}
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
        {navItems(currentSpace(location.pathname), i18n.language).map(item => {
          const isActive =
            item.icon === SettingsIcon
              ? location.pathname.startsWith(item.url) ||
                (shouldShowOfflineFeatures &&
                  location.pathname === `${basePath}offline`) ||
                location.pathname === `${basePath}data` ||
                location.pathname === `${basePath}instructions` ||
                location.pathname === `${basePath}huerta/instructions` ||
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
                <span
                  className={cn(
                    'block transition-transform duration-fast ease-standard hover:scale-110 active:scale-95',
                    isActive && 'scale-120'
                  )}
                >
                  <Icon className='h-6 w-6' />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
