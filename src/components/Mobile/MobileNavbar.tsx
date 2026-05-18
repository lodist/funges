import { Link, useLocation } from '@tanstack/react-router';
import {
  Map,
  CalendarRange,
  ChefHat,
  Database,
  Settings as SettingsIcon,
  BarChart2,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion } from 'framer-motion';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';

const basePath = import.meta.env.BASE_URL || '/';
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
      className='fixed bottom-4 left-4 right-4 z-10'
      initial={{ y: 0 }}
      animate={{ y: hidden ? 120 : 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        duration: 0.3,
      }}
    >
      <div className='bg-white rounded-2xl shadow-lg'>
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
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-primary-600'
                      : 'text-muted-foreground hover:text-primary-600'
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
      </div>
    </motion.nav>
  );
}
