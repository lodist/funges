import { Link, useLocation } from '@tanstack/react-router';
import {
  Map,
  CalendarRange,
  ChefHat,
  Database,
  Settings as SettingsIcon,
  BarChart2,
} from '@/lib/icons';
import { useIsMobile } from '@/hooks/use-mobile';
import { NAV_SURFACE_CLASS } from '@/lib/nav-surface';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
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
const items = [
  { url: `${basePath}`, icon: Map },
  { url: `${basePath}worth-foraging-now`, icon: CalendarRange },
  { url: `${basePath}recipes`, icon: ChefHat },
  { url: `${basePath}species`, icon: Database },
  { url: `${basePath}data`, icon: BarChart2 },
  { url: `${basePath}settings`, icon: SettingsIcon },
];
interface MobileNavbarProps {
  hidden: boolean;
}

export default function MobileNavbar({ hidden }: MobileNavbarProps) {
  const isMobile = useIsMobile();
  const location = useLocation();

  if (!isMobile) return null;

  return (
    <motion.nav
      // Raised + Glass-regular, shared with AppSidebar (#196). Carried on the
      // animated element itself rather than an inner wrapper: a backdrop-filter
      // nested inside a transformed ancestor samples the wrong region in Safari.
      className={cn(
        'fixed bottom-4 left-4 right-4 z-10 rounded-2xl',
        NAV_SURFACE_CLASS
      )}
      initial={{ y: 0 }}
      animate={{ y: hidden ? 120 : 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        // Motion (#200): mirrors CSS --duration-slow (300ms).
        duration: 0.3,
      }}
    >
      <ul className='flex justify-around items-center py-3 px-3'>
        {items.map(item => {
          const isActive =
            item.url === `${basePath}settings`
              ? location.pathname.startsWith(`${basePath}settings`) ||
                (shouldShowOfflineFeatures &&
                  location.pathname === `${basePath}offline`) ||
                location.pathname === `${basePath}instructions` ||
                location.pathname === `${basePath}support` ||
                location.pathname === `${basePath}impressum` ||
                location.pathname === `${basePath}privacy-policy` ||
                location.pathname === `${basePath}termsuse`
              : location.pathname === item.url;
          const Icon = item.icon;
          return (
            <li key={item.url} className='flex-1'>
              <Link
                to={item.url}
                // Section-adaptive accent is tint + scale only, so without
                // this the active section is conveyed by colour alone.
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-[var(--duration-base)] ${
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
