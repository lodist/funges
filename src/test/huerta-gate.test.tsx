import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HuertaGate } from '@/components/HuertaGate';
import { setSession } from '@/lib/huerta-session';

vi.mock('@/components/HuertaSignIn', () => ({
  HuertaSignIn: () => <p>{'sign-in screen'}</p>,
}));
// A build that talks to the Worker.
vi.mock('@/lib/huerta-api', () => ({ huertaApiConfigured: true }));

beforeEach(() => {
  localStorage.clear();
  setSession(null);
});
afterEach(() => vi.unstubAllGlobals());

describe('the Huerta gate', () => {
  it('shows the sign-in screen until the device is signed in', () => {
    render(
      <HuertaGate>
        <p>{'garden page'}</p>
      </HuertaGate>
    );
    expect(screen.getByText('sign-in screen')).toBeInTheDocument();
    expect(screen.queryByText('garden page')).toBeNull();
  });

  it('shows the page signed in, and syncs the gardens', async () => {
    setSession({ token: 'f'.repeat(64), email: 'a@b.c' });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([]));
    vi.stubGlobal('fetch', fetch);
    render(
      <HuertaGate>
        <p>{'garden page'}</p>
      </HuertaGate>
    );
    expect(screen.getByText('garden page')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(String(fetch.mock.calls[0]?.[0])).toContain('/v1/gardens?t=')
    );
  });
});
