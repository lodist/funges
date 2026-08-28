import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import MapLastUpdated from '@/components/MapLastUpdated';

/**
 * The freshness line answers "how old is this data?", so it is relative all the
 * way down. It used to print a bare date past 24 hours, which made the reader
 * do the arithmetic; the sidebar footer showed `27/08/2026` where `yesterday`
 * was the answer.
 *
 * `Intl.RelativeTimeFormat` does the localising for all six bundles — the loop
 * under test only picks the unit, which is the part that can be wrong.
 */

const NOW = new Date('2026-08-28T12:00:00Z');

function mockMetadata(updatedAt: Date) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ updated_at: updatedAt.toISOString() }),
      })
    )
  );
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const renderAged = async (age: number) => {
  mockMetadata(ago(age));
  render(<MapLastUpdated variant='sidebar' />);
  return waitFor(() => screen.getByText(/updated/i));
};

describe('the freshness line stays relative at every scale', () => {
  it.each([
    ['minutes', 30 * MINUTE, /30 minutes ago/i],
    ['hours', 5 * HOUR, /5 hours ago/i],
    ['yesterday', 1 * DAY, /yesterday/i],
    ['days', 3 * DAY, /3 days ago/i],
    ['weeks', 20 * DAY, /weeks? ago/i],
    ['months', 90 * DAY, /months? ago/i],
    ['years', 800 * DAY, /years? ago/i],
  ])('reads %s, never a bare date', async (_label, age, expected) => {
    await renderAged(age);

    expect(screen.getByText(expected, { exact: false })).toBeInTheDocument();
  });
});

describe('the exact timestamp is still reachable', () => {
  it('keeps the full date in the title, since the visible text is relative', async () => {
    await renderAged(3 * DAY);

    const line = document.querySelector('[title]');
    expect(line?.getAttribute('title')).toMatch(/2026/);
  });
});

describe('the freshness signal does not animate', () => {
  it('carries no perpetual pulse: nothing here polls', async () => {
    // The dot pulsed forever while the component fetches once on mount, so the
    // animation reported a liveness the data does not have.
    await renderAged(3 * DAY);

    const animated = document.querySelectorAll('[class*="animate-"]');
    expect(animated).toHaveLength(0);
  });
});
