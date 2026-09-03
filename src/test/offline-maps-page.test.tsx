import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import i18n from '@/i18n';
import type {
  OfflinePackageDefinition,
  OfflinePackageId,
} from '@/lib/offline-packages';

// This page used to list continents as rows whose single control swapped its
// own label between "Download for offline" and "Remove": the control said what
// would happen next instead of showing how things stood. It now lists
// versioned packages, which have more states than a two-way toggle can carry
// (absent, downloading, installed, update available), so the toggle is gone.
// The two intents behind it still hold and are what this file guards:
// every control carries its own accessible name, and a forager who is offline
// cannot download but can still free the space a cached package is using.

const download = vi.fn();
const remove = vi.fn();
const cancel = vi.fn();
const navigate = vi.fn();

function definition(
  id: OfflinePackageId,
  continent: 'eu' | 'us'
): OfflinePackageDefinition {
  return {
    id,
    continent,
    name: id,
    description: `${id} description`,
    bounds: [-10, 35, 30, 60],
    minZoom: 0,
    maxZoom: 8,
    version: '2',
    updatedAt: '2026-01-01T00:00:00Z',
    published: true,
    resources: [
      {
        id: `${id}-basemap`,
        kind: 'basemap',
        sourceUrl: `https://example.test/${id}.pmtiles`,
        sizeBytes: 4 * 1024 * 1024,
      },
    ],
  };
}

const state = {
  available: [] as OfflinePackageDefinition[],
  cached: {} as Record<
    string,
    | { id: string; cachedAt: number; version: string; expired: boolean }
    | undefined
  >,
  progress: {} as Record<string, { fraction: number } | undefined>,
  storage: { usageBytes: 0, quotaBytes: 0, persisted: true },
  ready: true,
  loading: false,
  error: null as string | null,
  initialize: vi.fn(),
  refresh: vi.fn(),
  download,
  cancel,
  remove,
  activateForCoordinate: vi.fn(),
};
let isOnline = true;

vi.mock('@/store/offlineStore', () => ({
  useOfflineStore: () => state,
}));
vi.mock('@/hooks/use-pwa', () => ({
  usePWA: () => ({ isOnline, hasUpdate: false, reloadForUpdate: vi.fn() }),
}));
vi.mock('@/store/mapStore', () => ({
  useMapStore: () => ({ setCenter: vi.fn(), setZoom: vi.fn() }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/components/SEO', () => ({ default: () => null }));

const { default: OfflineMapsPage } = await import('@/pages/OfflineMapsPage');

const installed = (
  id: string,
  over: { expired?: boolean; version?: string } = {}
) => ({
  id,
  cachedAt: Date.UTC(2026, 0, 2),
  version: over.version ?? '2',
  expired: over.expired ?? false,
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  state.available = [definition('eu', 'eu'), definition('us', 'us')];
  state.cached = {};
  state.progress = {};
  state.loading = false;
  state.error = null;
  isOnline = true;
  vi.clearAllMocks();
});

describe('OfflineMapsPage packages', () => {
  it('names every control it draws', () => {
    state.cached = { eu: installed('eu') };
    render(<OfflineMapsPage />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    // an icon alone is not a name: each control says what it does
    for (const button of buttons) {
      expect(
        button.textContent?.trim(),
        'control has no accessible name'
      ).toBeTruthy();
    }
  });

  it('shows how things stand, not only the errand', () => {
    state.cached = { eu: installed('eu') };
    render(<OfflineMapsPage />);

    // the cached package reports its own state instead of hiding it in a control
    expect(screen.getByText(/Downloaded .* version 2/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /open map/i })).toBeTruthy();
    // the absent one is the only thing still offering a download
    expect(screen.getByRole('button', { name: /^download$/i })).toBeTruthy();
  });

  it('offers an update, and removal, once a cached package is stale', () => {
    state.cached = { eu: installed('eu', { version: '1' }) };
    render(<OfflineMapsPage />);

    expect(screen.getByRole('button', { name: /update/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy();
  });

  it('trades the download control for progress and a cancel while tiles come down', async () => {
    state.progress = { eu: { fraction: 0.25 } };
    const user = userEvent.setup();
    render(<OfflineMapsPage />);

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    // only the untouched package still offers a download
    expect(screen.getAllByRole('button', { name: /^download$/i })).toHaveLength(
      1
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(cancel).toHaveBeenCalledWith('eu');
  });

  it('offline: cannot download, can still free the space', async () => {
    isOnline = false;
    state.cached = { eu: installed('eu') };
    const user = userEvent.setup();
    render(<OfflineMapsPage />);

    expect(screen.getByRole('button', { name: /^download$/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(remove).toHaveBeenCalledWith('eu');
    expect(download).not.toHaveBeenCalled();
  });
});
