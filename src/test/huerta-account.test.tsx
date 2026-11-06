import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { HuertaAccount } from '@/components/HuertaAccount';
import { setSession } from '@/lib/huerta-session';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

beforeEach(() => setSession(null));
afterEach(() => vi.unstubAllGlobals());

describe("Settings' Huerta account", () => {
  it('is not there when signed out', () => {
    const { container } = render(<HuertaAccount />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says who is signed in, with sign-out and delete', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json({
          email: 'a@b.c',
          kinds: ['frost'],
          lang: 'en',
          tz: 'UTC',
        })
      )
    );
    setSession({ token: 'f'.repeat(64), email: 'a@b.c' });
    render(<HuertaAccount />);
    expect(screen.getByText('Signed in as a@b.c')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete account' })
    ).toBeInTheDocument();
  });
});
