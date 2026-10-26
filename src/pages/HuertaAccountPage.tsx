import { useTranslation } from 'react-i18next';
import { HuertaAccount } from '@/components/HuertaAccount';
import { ScopeHeader } from '@/components/ScopeHeader';

/** The Huerta account on its own page (desktop's Help → Account): who is
 *  signed in, signing out, deleting the account. Behind the Huerta gate, so
 *  signed out it is the sign-in screen. */
export default function HuertaAccountPage() {
  const { t } = useTranslation('sidebar');
  return (
    <div className='container mx-auto max-w-3xl px-4 py-8'>
      <header className='mb-8'>
        <ScopeHeader title={t('account')} action={null} />
      </header>
      <HuertaAccount />
    </div>
  );
}
