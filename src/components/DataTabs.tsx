import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** The Data page's two reports: today's conditions (the main one) and the season atlas. */
export function DataTabs({ active }: { active: 'conditions' | 'seasons' }) {
  const { t } = useTranslation('common');
  const tabs = [
    { id: 'conditions', to: '/data', label: t('data.tabs.conditions') },
    { id: 'seasons', to: '/data/seasons', label: t('data.tabs.seasons') },
  ] as const;

  return (
    // The Data page's segmented control, as links: the active tab a light
    // green halo with dark green text, the other readable green.
    <nav
      aria-label={t('data.tabs.label')}
      className='-ml-1 inline-flex items-center gap-1 self-start rounded-full p-1'
    >
      {tabs.map(tab => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-happy-100 text-happy-900'
                : 'text-primary-text hover:text-happy-900 dark:hover:text-happy-100'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
