import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { List, Navigation, Hash, Moon, MousePointerClick } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ONBOARDING_KEY = 'onboardingDismissed';

export default function OnboardingModal() {
  const { t } = useTranslation('map');
  const { activeModal, setActiveModal } = useUIStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (activeModal === 'onboarding') {
      setOpen(true);
    }
  }, [activeModal]);

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (!value) {
      localStorage.setItem(ONBOARDING_KEY, 'true');
      setActiveModal(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-md' showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('onboarding.title')}</DialogTitle>
          <DialogDescription>{t('onboarding.description')}</DialogDescription>
        </DialogHeader>
        <ul className='mt-4 space-y-2 text-sm'>
          <li className='flex items-center gap-2'>
            <List className='h-4 w-4' />
            {t('onboarding.features.species')}
          </li>
          <li className='flex items-center gap-2'>
            <Navigation className='h-4 w-4' />
            {t('onboarding.features.locate')}
          </li>
          <li className='flex items-center gap-2'>
            <Hash className='h-4 w-4' />
            {t('onboarding.features.numbers')}
          </li>
          <li className='flex items-center gap-2'>
            <Moon className='h-4 w-4' />
            {t('onboarding.features.theme')}
          </li>
          <li className='flex items-center gap-2'>
            <MousePointerClick className='h-4 w-4' />
            {t('onboarding.features.zones')}
          </li>
        </ul>
        <div className='mt-4 text-sm'>
          <Link to='/instructions' className='underline text-primary'>
            {t('onboarding.instructions')}
          </Link>
        </div>
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)}>
            {t('onboarding.dismiss')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
