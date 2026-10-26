import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'f'.repeat(64);
const HANDOFF = 'ab'.repeat(16);

/** The module fresh, talking to a stubbed Worker. */
async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_HUERTA_API', 'https://w.test');
  return import('@/lib/huerta-session');
}
const answer = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status })
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('signing in to Huerta', () => {
  it('sends the visitor to Google with a handoff and its hash as nonce', async () => {
    const s = await load();
    const go = vi.fn();
    await s.startSignIn('/huerta/planner', go);
    const url = new URL(go.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(url.searchParams.get('client_id')).toBe(s.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${location.origin}/huerta/signin`
    );
    expect(url.searchParams.get('response_type')).toBe('id_token');
    const pending = JSON.parse(sessionStorage.getItem('huerta-signin')!);
    expect(pending.back).toBe('/huerta/planner');
    expect(url.searchParams.get('state')).toBe(pending.handoff);
    expect(url.searchParams.get('nonce')).toBe(await s.sha256(pending.handoff));
  });

  it('finishes where it began, and goes back', async () => {
    const s = await load();
    sessionStorage.setItem(
      'huerta-signin',
      JSON.stringify({ handoff: HANDOFF, back: '/huerta/planner' })
    );
    const fetch = answer({ token: TOKEN, email: 'a@b.c' });
    vi.stubGlobal('fetch', fetch);
    expect(await s.finishSignIn(`#state=${HANDOFF}&id_token=x.y.z`)).toEqual({
      back: '/huerta/planner',
      here: true,
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      credential: 'x.y.z',
      handoff: HANDOFF,
    });
    expect(s.session()).toEqual({ token: TOKEN, email: 'a@b.c' });
    expect(sessionStorage.getItem('huerta-signin')).toBeNull();
    // Its sign-in record is collected at once, so the Worker deletes it.
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      `https://w.test/v1/auth/handoff?id=${HANDOFF}`
    );
  });

  it('finishes elsewhere: an iPhone Home Screen app began it', async () => {
    const s = await load();
    vi.stubGlobal('fetch', answer({ token: TOKEN, email: 'a@b.c' }));
    expect(
      await s.finishSignIn(`#state=${'cd'.repeat(16)}&id_token=x.y.z`)
    ).toEqual({ back: '/huerta/in-season', here: false });
  });

  it('says why when Google sent no token', async () => {
    const s = await load();
    await expect(
      s.finishSignIn('#error=access_denied&state=x')
    ).rejects.toThrow('access_denied');
  });

  it('collects the session when the app is back in view', async () => {
    const s = await load();
    sessionStorage.setItem(
      'huerta-signin',
      JSON.stringify({ handoff: HANDOFF, back: '/huerta' })
    );
    const fetch = answer({ token: TOKEN, email: 'a@b.c' });
    vi.stubGlobal('fetch', fetch);
    expect(await s.pickUpHandoff()).toBe(true);
    expect(String(fetch.mock.calls[0][0])).toBe(
      `https://w.test/v1/auth/handoff?id=${HANDOFF}`
    );
    expect(s.session()?.token).toBe(TOKEN);
  });

  it('collects nothing when no sign-in is under way', async () => {
    const s = await load();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await s.pickUpHandoff()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the session', () => {
  it('rides on every call, and a 401 signs the device out', async () => {
    const s = await load();
    s.setSession({ token: TOKEN, email: 'a@b.c' });
    localStorage.setItem('huerta-gardens', '[]');
    expect(s.apiUrl('/v1/crops')).toBe(`https://w.test/v1/crops?t=${TOKEN}`);
    vi.stubGlobal('fetch', answer({}, 401));
    await s.apiFetch('/v1/crops');
    expect(s.session()).toBeNull();
    expect(localStorage.getItem('huerta-gardens')).toBeNull();
  });

  it('signs out even when the Worker cannot be reached', async () => {
    const s = await load();
    s.setSession({ token: TOKEN, email: 'a@b.c' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      })
    );
    await s.signOut();
    expect(s.session()).toBeNull();
  });
});
