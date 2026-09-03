import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import ThemeToggle from '@/components/ThemeToggle';
import i18n from '@/i18n';

const STORAGE_KEY = 'vite-ui-theme';

const renderToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('light', 'dark');
});

describe('ThemeToggle', () => {
  it('offers all three themes as one exclusive choice', () => {
    renderToggle();
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('starts on System, the provider default', () => {
    renderToggle();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it.each([
    ['Light', 'light'],
    ['Dark', 'dark'],
  ])(
    'applies %s to the document root and persists it',
    async (label, theme) => {
      const user = userEvent.setup();
      renderToggle();

      await user.click(screen.getByRole('radio', { name: label }));

      expect(document.documentElement).toHaveClass(theme);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(theme);
      expect(screen.getByRole('radio', { name: label })).toBeChecked();
    }
  );

  // The stored preference is what stays selected, not the class the provider
  // resolved onto <html> — otherwise "System" would read as "Dark" at night.
  it('keeps System selected even though it resolves to a concrete class', () => {
    localStorage.setItem(STORAGE_KEY, 'system');
    renderToggle();

    expect(document.documentElement.className).toMatch(/light|dark/);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it('labels every option in all six locales', () => {
    const locales = readdirSync('src/i18n/locales', { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const locale of locales) {
      const common = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}/common.json`, 'utf8')
      );
      for (const key of ['label', 'system', 'light', 'dark']) {
        expect(common.theme?.[key], `${locale} theme.${key}`).toBeTruthy();
      }
    }
  });
});
