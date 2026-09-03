import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

import FloatingLanguageSwitcher from '@/components/FloatingLanguageSwitcher';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import i18n from '@/i18n';
import { LANGUAGES, resolveLanguage } from '@/lib/languages';

const SWITCHERS = [
  ['LanguageSwitcher', LanguageSwitcher],
  ['FloatingLanguageSwitcher', FloatingLanguageSwitcher],
] as const;

const SOURCES = SWITCHERS.map(
  ([name]) =>
    [name, readFileSync(`src/components/${name}.tsx`, 'utf8')] as const
);

// Regional indicator pairs — the flag emoji that stood in for an icon system.
const FLAG_EMOJI = /[\u{1F1E6}-\u{1F1FF}]/u;

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('language registry', () => {
  it('covers exactly the locales that ship', () => {
    const shipped = readdirSync('src/i18n/locales', {
      withFileTypes: true,
    })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
    expect(LANGUAGES.map(l => l.code).sort()).toEqual(shipped);
  });

  it('resolves a regional tag to its base language', () => {
    expect(resolveLanguage('it-IT').name).toBe('Italiano');
    expect(resolveLanguage('it').name).toBe('Italiano');
  });

  it('falls back to English on an unknown or missing tag', () => {
    expect(resolveLanguage('zz').name).toBe('English');
    expect(resolveLanguage(undefined).name).toBe('English');
  });
});

describe.each(SOURCES)('%s source', (_name, source) => {
  it('carries no flag emoji', () => {
    expect(FLAG_EMOJI.test(source)).toBe(false);
  });

  it('does not declare its own language list', () => {
    expect(source).not.toContain('Italiano');
    expect(source).toContain("from '@/lib/languages'");
  });
});

describe.each(SWITCHERS)('%s', (_name, Switcher) => {
  it('names the control and the active language', async () => {
    await i18n.changeLanguage('en');
    render(<Switcher />);
    expect(
      screen.getByRole('button', { name: 'Language: English' })
    ).toBeInTheDocument();
  });

  it('reads the active language from a regional tag', async () => {
    await i18n.changeLanguage('it-IT');
    render(<Switcher />);
    expect(
      screen.getByRole('button', { name: 'Lingua: Italiano' })
    ).toBeInTheDocument();
  });

  it('shows the language code on the trigger', async () => {
    await i18n.changeLanguage('de');
    const { container } = render(<Switcher />);
    const code = container.querySelector('.type-micro');
    expect(code?.textContent).toBe('de');
  });
});
