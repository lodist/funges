import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import i18n from '@/i18n';

// Each region row drew its toggle as a button whose label swapped between
// "Download for offline" and "Remove", with the state kept in a separate
// column: the control said what would happen next instead of showing how
// things stood. It is a Switch now, and the disabled logic the two buttons
// carried between them has to survive the merge — a forager offline cannot
// download, but can still free the space a cached region is using.

const download = vi.fn();
const remove = vi.fn();
const state = {
  cached: {} as Record<
    string,
    { cachedAt: number; sizeBytes: number } | undefined
  >,
  downloading: {} as Record<string, boolean>,
  error: null as string | null,
  refresh: vi.fn(),
  download,
  remove,
  purgeExpired: vi.fn(),
};
let isOnline = true;

vi.mock('@/store/offlineStore', () => ({
  useOfflineStore: () => state,
  CONTINENTS: ['eu', 'us'],
}));
vi.mock('@/hooks/use-pwa', () => ({
  usePWA: () => ({ isOnline, hasUpdate: false, reloadForUpdate: vi.fn() }),
}));
vi.mock('@/components/SEO', () => ({ default: () => null }));

const { default: OfflineMapsPage } = await import('@/pages/OfflineMapsPage');

const switches = () =>
  [...document.querySelectorAll('[data-slot=switch]')] as HTMLButtonElement[];

beforeEach(async () => {
  await i18n.changeLanguage('en');
  state.cached = {};
  state.downloading = {};
  isOnline = true;
  download.mockClear();
  remove.mockClear();
});

describe('OfflineMapsPage region rows', () => {
  it('gives every region a switch named by its own row', () => {
    render(<OfflineMapsPage />);

    const rows = switches();
    expect(rows).toHaveLength(2);
    // the name is the visible region cell, so it never drifts from the label
    for (const s of rows) {
      const id = s.getAttribute('aria-labelledby');
      expect(id, 'switch has no accessible name').toBeTruthy();
      expect(document.getElementById(id!)?.textContent).toBeTruthy();
    }
    expect(screen.getByRole('switch', { name: 'Europe' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'United States' })).toBeTruthy();
  });

  it('shows the setting, not the errand', () => {
    state.cached = { eu: { cachedAt: Date.now(), sizeBytes: 1024 } };
    render(<OfflineMapsPage />);

    expect(screen.getByRole('switch', { name: 'Europe' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'United States' })
    ).not.toBeChecked();
    // no label-swapping button survives
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /download for offline/i })
    ).toBeNull();
  });

  it('downloads on, removes off', async () => {
    const user = userEvent.setup();
    render(<OfflineMapsPage />);

    await user.click(screen.getByRole('switch', { name: 'Europe' }));
    expect(download).toHaveBeenCalledWith('eu');
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes a cached region when switched off', async () => {
    state.cached = { eu: { cachedAt: Date.now(), sizeBytes: 1024 } };
    const user = userEvent.setup();
    render(<OfflineMapsPage />);

    await user.click(screen.getByRole('switch', { name: 'Europe' }));
    expect(remove).toHaveBeenCalledWith('eu');
    expect(download).not.toHaveBeenCalled();
  });

  it('locks the switch while its tiles are still coming down', () => {
    state.downloading = { eu: true };
    render(<OfflineMapsPage />);

    expect(screen.getByRole('switch', { name: 'Europe' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'United States' })).toBeEnabled();
    // the knob cannot carry progress, so the status cell keeps it
    expect(screen.getByText('Downloading...')).toBeTruthy();
  });

  it('offline: cannot download, can still free the space', () => {
    isOnline = false;
    state.cached = { eu: { cachedAt: Date.now(), sizeBytes: 1024 } };
    render(<OfflineMapsPage />);

    expect(screen.getByRole('switch', { name: 'Europe' })).toBeEnabled();
    expect(
      screen.getByRole('switch', { name: 'United States' })
    ).toBeDisabled();
  });
});
