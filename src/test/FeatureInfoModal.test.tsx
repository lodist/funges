import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import i18n from '@/i18n';
import FeatureInfoModal from '@/components/FeatureInfoModal';

const navigateMock = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

function makeFeature(
  properties: Record<string, unknown>
): maplibregl.GeoJSONFeature {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'Point',
      coordinates: [7.976074, 45.678035],
    },
  } as unknown as maplibregl.GeoJSONFeature;
}

const twoSpeciesFeature = makeFeature({
  chant_score: 6.7,
  boletus_score: 7.2,
});

beforeEach(async () => {
  await i18n.changeLanguage('it');
  navigateMock.mockClear();
});

describe('FeatureInfoModal', () => {
  it('renders a centered title and no subtitle', () => {
    render(
      <FeatureInfoModal feature={twoSpeciesFeature} open onClose={vi.fn()} />
    );

    expect(
      screen.getByRole('heading', { name: /specie di quest.?area/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/specie rilevate/i)).not.toBeInTheDocument();
  });

  it('shows exactly one close button, icon-only, and closes on click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureInfoModal feature={twoSpeciesFeature} open onClose={onClose} />
    );

    // The guard here is the *count*: a redundant text close button alongside
    // Dialog's own icon button is the regression this test was written for.
    // It used to find the icon button by the name /close/i, which only worked
    // while DialogContent's sr-only label was hardcoded English (#225).
    const closeButtons = screen.getAllByRole('button', { name: /^chiudi$/i });
    expect(closeButtons).toHaveLength(1);

    // Icon-only: the accessible name comes from sr-only text, so nothing of it
    // is visible.
    expect(closeButtons[0].textContent?.trim()).toBe('Chiudi');
    expect(closeButtons[0].querySelector('.sr-only')).not.toBeNull();

    await user.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalled();
  });

  it('hides "Ottieni Indicazioni" when hideDirections is true, and never shows "Vedi dati area" without a dataNerdRegion', () => {
    render(
      <FeatureInfoModal
        feature={twoSpeciesFeature}
        open
        onClose={vi.fn()}
        hideDirections
      />
    );

    expect(
      screen.queryByRole('button', { name: /naviga/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /vedi dati area/i })
    ).not.toBeInTheDocument();
  });

  it('shows "Vedi dati area" when a dataNerdRegion is provided and navigates to /data on click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureInfoModal
        feature={twoSpeciesFeature}
        open
        onClose={onClose}
        dataNerdRegion='NE'
      />
    );

    const dataNerdButton = screen.getByRole('button', {
      name: /vedi dati area/i,
    });
    await user.click(dataNerdButton);

    expect(onClose).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/data',
      search: { region: 'NE' },
    });
  });

  it('copies the coordinates to the clipboard when the coordinates button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FeatureInfoModal feature={twoSpeciesFeature} open onClose={vi.fn()} />
    );

    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const coordinatesButton = screen.getByRole('button', {
      name: /45\.678035, 7\.976074/,
    });
    await user.click(coordinatesButton);

    expect(writeTextSpy).toHaveBeenCalledWith('45.678035, 7.976074');
  });

  it('tells the reader when the clipboard refuses, out of a region that was already mounted', async () => {
    const user = userEvent.setup();
    render(
      <FeatureInfoModal feature={twoSpeciesFeature} open onClose={vi.fn()} />
    );

    // The region has to exist before its text changes: one rendered by the
    // failure arrives with its text already in place, and a screen reader
    // announces nothing.
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe('');

    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    );
    await user.click(
      screen.getByRole('button', { name: /45\.678035, 7\.976074/ })
    );

    expect(live?.textContent).toMatch(/copia non riuscita/i);
  });
});
