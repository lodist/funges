/**
 * Signing in to Huerta: Google's own sign-in page hands back an ID token (no
 * client secret anywhere), and the Huerta Worker turns it into a session token
 * kept on the device for a year.
 *
 * One flow for browsers, the Android app and the iPhone Home Screen app. On
 * iPhone, Google's page opens in a separate browser view with its own storage,
 * so the sign-in carries a random handoff id: Google signs its hash as the
 * nonce, the Worker keeps the session under it for a few minutes, and the app
 * that began the sign-in collects it when it is back in view.
 */
import { useSyncExternalStore } from 'react';

const API = import.meta.env.VITE_HUERTA_API as string | undefined;
/** Public: the Google Cloud project "Funges", web client. */
export const GOOGLE_CLIENT_ID =
  '842955568649-ejakc7anem1j52gvku9leu7qt73m8c0e.apps.googleusercontent.com';
const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth';
const SESSION = 'huerta-session';
const PENDING = 'huerta-signin';
/** Everything Huerta keeps on the device, gone when the device signs out. */
const DEVICE_KEYS = [
  'huerta-gardens',
  'huerta-garden',
  'huerta-advice',
  'huerta-year',
  'huerta-plan',
  'huerta-place',
];

export interface Session {
  token: string;
  email: string;
}

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (text: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

const listeners = new Set<() => void>();
let current: Session | null | undefined;

/** The device's session, or null when signed out. */
export function session(): Session | null {
  if (current === undefined)
    try {
      current = JSON.parse(localStorage.getItem(SESSION) ?? 'null');
    } catch {
      current = null;
    }
  return current ?? null;
}

export function setSession(next: Session | null) {
  current = next;
  try {
    if (next) localStorage.setItem(SESSION, JSON.stringify(next));
    else localStorage.removeItem(SESSION);
  } catch {
    // Private mode or blocked storage: signed in for this visit only.
  }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // Signed in or out in another tab.
  const other = (event: StorageEvent) => {
    if (event.key !== SESSION) return;
    current = undefined;
    listener();
  };
  window.addEventListener('storage', other);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', other);
  };
};
export const useSession = () =>
  useSyncExternalStore(subscribe, session, () => null);

const pending = (): { handoff: string; back: string } | null => {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
  } catch {
    return null;
  }
};

/** Off to Google's sign-in page; back at /huerta/signin, then at `back`. */
export async function startSignIn(
  back: string,
  go = (url: string) => window.location.assign(url)
) {
  const handoff = hex(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PENDING, JSON.stringify({ handoff, back }));
  const query = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${window.location.origin}${import.meta.env.BASE_URL}huerta/signin`,
    response_type: 'id_token',
    scope: 'openid email',
    nonce: await sha256(handoff),
    state: handoff,
    prompt: 'select_account',
  });
  go(`${GOOGLE}?${query}`);
}

const device = () => ({
  lang: (document.documentElement.lang || navigator.language).slice(0, 2),
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

/** Where Google comes back: its token for a session. `here` is false when
 *  the sign-in began in another browser view (the iPhone Home Screen app),
 *  which collects the session itself. */
export async function finishSignIn(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const credential = params.get('id_token');
  if (!credential) throw new Error(params.get('error') ?? 'no token');
  const handoff = params.get('state') ?? '';
  const response = await fetch(`${API}/v1/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential, handoff, ...device() }),
  });
  if (!response.ok) throw new Error(`sign-in ${response.status}`);
  setSession((await response.json()) as Session);
  const started = pending();
  const here = started?.handoff === handoff;
  if (here) sessionStorage.removeItem(PENDING);
  return { back: here ? started.back : '/huerta/in-season', here };
}

/** Back in view after signing in in another browser view: the session, once. */
export async function pickUpHandoff() {
  const started = pending();
  if (!started || session()) return false;
  const response = await fetch(`${API}/v1/auth/handoff?id=${started.handoff}`);
  if (!response.ok) return false;
  sessionStorage.removeItem(PENDING);
  setSession((await response.json()) as Session);
  return true;
}

/** A Worker URL as the signed-in account. The token rides in the URL, as the
 *  key did: a header would cost every GET a CORS preflight. */
export const apiUrl = (
  path: string,
  query: Record<string, string | number> = {}
) =>
  `${API}${path}?${new URLSearchParams({
    ...query,
    t: session()?.token ?? '',
  } as Record<string, string>)}`;

/** A call to the Worker as the signed-in account; a 401 signs the device out. */
export async function apiFetch(
  path: string,
  query?: Record<string, string | number>,
  init?: RequestInit
) {
  const response = await fetch(apiUrl(path, query), init);
  if (response.status === 401) forget();
  return response;
}

function forget() {
  try {
    DEVICE_KEYS.forEach(key => localStorage.removeItem(key));
  } catch {
    // Blocked storage: nothing was kept.
  }
  setSession(null);
}

export async function signOut() {
  await apiFetch('/v1/auth/signout', {}, { method: 'POST' }).catch(() => {});
  forget();
}

/** The account, its gardens and its alerts, everywhere. */
export async function deleteAccount() {
  const response = await apiFetch('/v1/account', {}, { method: 'DELETE' });
  if (!response.ok) throw new Error(`delete ${response.status}`);
  forget();
}
