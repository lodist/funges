/**
 * Morning alerts on this device: a push subscription the Huerta Worker's cron
 * sends to (public/huerta-push.js shows it). Phones and browsers only; on
 * iPhone, only for an app on the Home Screen.
 */
import { apiFetch } from '@/lib/huerta-session';

/** The VAPID public key; its private half is the Huerta Worker's secret
 *  VAPID_PRIVATE_KEY (a copy is in funges/.env.secret). */
export const VAPID_PUBLIC =
  'BGQcZOB3zY5QNvMeiXU1kSpfiE4-0eCfz0WSkga2vklFUHeCUs-o_ILcLMkcwP2J3wKQGWQKvlF4tC2-hsIGFE8';

const bytes = (base64url: string) =>
  Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), c =>
    c.charCodeAt(0)
  );

/** Morning alerts are off for now (Loris, 26 Oct): the switch stays hidden and
 *  the Worker has no cron. Back on: true here, and the cron in wrangler.toml. */
export const ALERTS_ON = false;

export const pushSupported = () =>
  ALERTS_ON &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** iPhone and iPad deliver web push only to an app on the Home Screen. */
export const needsHomeScreen = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(navigator as { standalone?: boolean }).standalone;

const subscription = async () =>
  (
    await navigator.serviceWorker.getRegistration()
  )?.pushManager.getSubscription() ?? null;

export const alertsOn = async () => Boolean(await subscription());

/** Ask for permission, subscribe, and tell the Worker. */
export async function enableAlerts(lang: string) {
  if ((await Notification.requestPermission()) !== 'granted')
    return 'denied' as const;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes(VAPID_PUBLIC),
  });
  const response = await apiFetch(
    '/v1/push',
    {},
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        lang,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }
  );
  if (!response.ok) {
    await sub.unsubscribe();
    throw new Error(`push ${response.status}`);
  }
  return 'on' as const;
}

export async function disableAlerts() {
  const sub = await subscription();
  if (!sub) return;
  await apiFetch(
    '/v1/push',
    {},
    {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }
  );
  await sub.unsubscribe();
}
