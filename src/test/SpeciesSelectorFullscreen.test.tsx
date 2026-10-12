import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesSelectorFullscreen from '@/components/SpeciesSelectorFullscreen';

/**
 * The map's species panel searched common names only, so the scientific name
 * printed on every card ("edulis") found nothing. And it reset the category to
 * "All types" on every open, sending someone browsing mushrooms back to the
 * full list after each pick.
 */

vi.mock('@/store/mapStore', () => ({
  useMapStore: () => ({
    selectedSpecies: 'mushroom',
    speciesOptions: [
      { code: 'mushroom', emoji: '🍄', category: 'mushroom' },
      { code: 'hazelnut', emoji: '🌰', category: 'nut' },
    ],
    setSelectedSpecies: vi.fn(),
    updateVisibleLayers: vi.fn(),
  }),
}));
vi.mock('@/store/offlineStore', () => ({
  useOfflineStore: () => ({ cached: {} }),
}));
vi.mock('@/hooks/use-pwa', () => ({ usePWA: () => ({ isOnline: true }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const open = () =>
  render(<SpeciesSelectorFullscreen isOpen onClose={() => {}} />);

describe('SpeciesSelectorFullscreen', () => {
  it('finds a species by its scientific name', async () => {
    open();
    await userEvent.type(screen.getByRole('textbox'), 'edulis');
    expect(screen.getByText('Boletus edulis')).toBeInTheDocument();
    expect(screen.queryByText('Corylus avellana')).toBeNull();
  });

  it('reopens on the category picked last time', async () => {
    const { unmount } = open();
    await userEvent.click(screen.getByText('nuts'));
    unmount();

    open();
    expect(screen.getByText('Corylus avellana')).toBeInTheDocument();
    expect(screen.queryByText('Boletus edulis')).toBeNull();
  });
});
