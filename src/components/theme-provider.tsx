'use client';

import { useEffect, useState } from 'react';
import { ThemeProviderContext } from '@/contexts/theme-context';
import type { Theme } from '@/types/theme';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;
    const query = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      root.classList.remove('light', 'dark');
      root.classList.add(
        theme === 'system' ? (query.matches ? 'dark' : 'light') : theme
      );
    };

    apply();
    if (theme !== 'system') return;

    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
