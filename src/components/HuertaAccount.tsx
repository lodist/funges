import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ALERT_KINDS, type AlertKind } from '@/lib/garden-alerts';
import {
  apiFetch,
  deleteAccount,
  signOut,
  useSession,
} from '@/lib/huerta-session';
import { Trash2 } from '@/lib/icons';
import {
  VAPID_PUBLIC,
  alertsOn,
  disableAlerts,
  enableAlerts,
  needsHomeScreen,
  pushSupported,
} from '@/lib/push';

type Alerts = 'off' | 'on' | 'denied' | 'busy';

/** Settings' Huerta block, when signed in: who, the morning alerts on this
 *  device and which kinds, signing out, and deleting the account. */
export function HuertaAccount() {
  const { t, i18n } = useTranslation('huerta');
  const navigate = useNavigate();
  const session = useSession();
  const [kinds, setKinds] = useState<AlertKind[]>(ALERT_KINDS);
  const [alerts, setAlerts] = useState<Alerts>('off');
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!session) return;
    let live = true;
    apiFetch('/v1/account')
      .then(r => (r.ok ? r.json() : null))
      .then(account => {
        if (live && account) setKinds(account.kinds);
      })
      .catch(() => {});
    if (pushSupported())
      alertsOn()
        .then(on => live && setAlerts(on ? 'on' : 'off'))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [session]);

  if (!session) return null;

  const toggle = async (on: boolean) => {
    setAlerts('busy');
    setFailed(false);
    try {
      if (on) setAlerts(await enableAlerts(i18n.language.slice(0, 2)));
      else {
        await disableAlerts();
        setAlerts('off');
      }
    } catch {
      setFailed(true);
      setAlerts(on ? 'off' : 'on');
    }
  };
  const choose = async (kind: AlertKind, on: boolean) => {
    const next = ALERT_KINDS.filter(k => (k === kind ? on : kinds.includes(k)));
    setKinds(next);
    const response = await apiFetch(
      '/v1/account',
      {},
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kinds: next }),
      }
    ).catch(() => null);
    setFailed(!response?.ok);
  };
  const remove = async () => {
    try {
      await deleteAccount();
      setConfirming(false);
      void navigate({ to: '/huerta' });
    } catch {
      setFailed(true);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.title')}</CardTitle>
        <CardDescription>
          {t('account.signedInAs', { email: session.email })}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {VAPID_PUBLIC ? (
          <section className='flex flex-col gap-3'>
            <div className='flex items-center justify-between gap-4'>
              <div>
                <h3 className='font-semibold text-foreground'>
                  {t('alerts.title')}
                </h3>
                <p className='text-sm text-muted-foreground'>
                  {t('alerts.text')}
                </p>
              </div>
              {pushSupported() && !needsHomeScreen() ? (
                <Switch
                  aria-label={t('alerts.title')}
                  checked={alerts === 'on'}
                  disabled={alerts === 'busy'}
                  onCheckedChange={on => void toggle(on)}
                />
              ) : null}
            </div>
            {needsHomeScreen() ? (
              <p className='text-sm text-foreground'>
                {t('alerts.homeScreen')}
              </p>
            ) : !pushSupported() ? (
              <p className='text-sm text-foreground'>
                {t('alerts.unsupported')}
              </p>
            ) : alerts === 'denied' ? (
              <p role='alert' className='text-sm text-foreground'>
                {t('alerts.denied')}
              </p>
            ) : null}
            {alerts === 'on' ? (
              <ul className='grid gap-2 sm:grid-cols-2'>
                {ALERT_KINDS.map(kind => (
                  <li key={kind} className='flex items-center gap-3'>
                    <Checkbox
                      id={`alert-${kind}`}
                      checked={kinds.includes(kind)}
                      onCheckedChange={on => void choose(kind, on === true)}
                    />
                    <Label htmlFor={`alert-${kind}`}>
                      {t(`alerts.kinds.${kind}`)}
                    </Label>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {failed ? (
          <p role='alert' className='text-sm text-destructive-text'>
            {t('account.failed')}
          </p>
        ) : null}
        <div className='flex flex-wrap gap-3'>
          <Button variant='outline' onClick={() => void signOut()}>
            {t('account.signOut')}
          </Button>
          <Button variant='destructive' onClick={() => setConfirming(true)}>
            <Trash2 className='size-4' />
            {t('account.delete')}
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('account.deleteText')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setConfirming(false)}>
              {t('account.cancel')}
            </Button>
            <Button variant='destructive' onClick={() => void remove()}>
              <Trash2 className='size-4' />
              {t('account.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
