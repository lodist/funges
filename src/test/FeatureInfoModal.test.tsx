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

  it('shows an icon-only close button and no text "Chiudi" button, and closes on click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureInfoModal feature={twoSpeciesFeature} open onClose={onClose} />
    );

    expect(
      screen.queryByRole('button', { name: /^chiudi$/i })
    ).not.toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

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
});
