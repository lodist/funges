import { useTranslation } from 'react-i18next';

import { Monitor, Moon, Sun } from '@/lib/icons';
import { useTheme } from '@/hooks/use-theme';
import type { Theme } from '@/types/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; icon: typeof Sun; labelKey: string }[] = [
  { value: 'system', icon: Monitor, labelKey: 'theme.system' },
  { value: 'light', icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
];

/** Light/dark/system switch for the app theme.
 *
 *  Three options rather than a two-state toggle: `system` is the default the
 *  ThemeProvider ships and following the OS preference is a stated product
 *  commitment, so a switch that could only reach light or dark would take a
 *  capability away rather than add one.
 *
 *  A radiogroup rather than three buttons — the options are one exclusive
 *  choice, and a screen reader should announce "2 of 3", not three unrelated
 *  controls. The check is `theme`, the stored preference, not the class the
 *  provider resolved onto <html>, so "System" stays selected at night. */
export default function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const { theme, setTheme } = useTheme();

  return (
    <div
      data-slot='theme-toggle'
      role='radiogroup'
      aria-label={t('theme.label', { defaultValue: 'Theme' })}
      className={cn(
        'flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5',
        className
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, labelKey }) => {
        const selected = theme === value;
        const label = t(labelKey);
        return (
          <button
            key={value}
            data-slot='theme-toggle-option'
            data-theme={value}
            type='button'
            role='radio'
            aria-checked={selected}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-card text-primary-text shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className='h-4 w-4' />
            <span className='sr-only'>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
