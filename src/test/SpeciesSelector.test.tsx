import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesSelector from '@/components/SpeciesSelector';

/**
 * The map's species trigger used to be two buttons: a photo tile for the
 * resolved case and a pill for the unresolved one. The pill was the branch
 * nobody could reach through the UI — the store boots to a species and never
 * clears it — so it shipped untested, with a `justify-between` and no `flex` to
 * justify against and a 32px box under the 44px floor. It was still reachable
 * through a stale persisted code, which is the one path that has to keep
 * working.
 *
 * These assertions pin the collapse: one trigger, both states, and a panel that
 * actually unmounts so its exit animation can run. Store and i18n are mocked
 * directly rather than wrapped in providers, following MobileNavbar.test.tsx.
 */

const { selectedSpecies } = vi.hoisted(() => ({
  selectedSpecies: { current: 'mushroom' as string | null },
}));

vi.mock('@/store/mapStore', () => ({
  useMapStore: () => ({
    get selectedSpecies() {
      return selectedSpecies.current;
    },
    speciesOptions: [{ code: 'mushroom', emoji: '🍄', category: 'mushroom' }],
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: (ns: string) => ({
    t: (key: string) =>
      ns === 'species' && key.endsWith('.name') ? 'Boletus' : key,
  }),
}));

vi.mock('@/components/SpeciesSelectorFullscreen', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid='panel'>{String(isOpen)}</div>
  ),
}));

beforeEach(() => {
  selectedSpecies.current = 'mushroom';
});

describe('SpeciesSelector trigger', () => {
  it('renders exactly one trigger, and it clears the touch floor', () => {
    render(<SpeciesSelector />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    // h-11 is the floor; the tile is h-16. A class assertion rather than a
    // measurement, because jsdom has no layout.
    expect(buttons[0].className).toMatch(/\bh-16\b/);
  });

  it('names the action as well as the species, and only once', () => {
    render(<SpeciesSelector />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label', 'species.select: Boletus');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    // The thumbnail is decorative: the species name used to arrive a third
    // time through the img alt.
    expect(btn.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('opens no heading level inside a map control', () => {
    render(<SpeciesSelector />);
    // `h1,h2,h3` take the display face from a global base rule, so the species
    // name was rendering in Space Grotesk at a Label size as well as landing in
    // the page outline with no section under it.
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('degrades to the select prompt when the persisted code no longer resolves', () => {
    selectedSpecies.current = 'a_species_that_was_removed';
    render(<SpeciesSelector />);
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('species.select');
    // No thumbnail and no binomial to invent for a species we cannot resolve.
    expect(btn.querySelector('img')).toBeNull();
    expect(btn).not.toHaveAttribute('aria-label');
  });

  it('mounts the panel only while open, so its exit can play', async () => {
    render(<SpeciesSelector />);
    expect(screen.queryByTestId('panel')).toBeNull();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('panel')).toHaveTextContent('true');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls back to the emoji when the species photo fails to load', () => {
    render(<SpeciesSelector />);
    const img = screen.getByRole('button').querySelector('img')!;
    expect(img.hidden).toBe(false);
    // getSpeciesImage only builds a URL and never returns null for a missing
    // file, so the old ternary on its return value could not reach the emoji.
    img.dispatchEvent(new Event('error'));
    expect(img.hidden).toBe(true);
    expect(screen.getByRole('button')).toHaveTextContent('🍄');
  });
});
