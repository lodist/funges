import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ChefHat,
  Heart,
  List,
  MousePointerClick,
  Navigation,
  Palette,
  ScanSearch,
} from 'lucide-react';
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
          {/* Same ScanSearch icon as the map control it describes, so the
              line and the button are recognisably the same feature. */}
          <li className='flex items-center gap-2'>
            <ScanSearch className='h-4 w-4' />
            {t('onboarding.features.identify')}
          </li>
          <li className='flex items-center gap-2'>
            <Navigation className='h-4 w-4' />
            {t('onboarding.features.locate')}
          </li>
          <li className='flex items-center gap-2'>
            <Palette className='h-4 w-4' />
            {t('onboarding.features.theme')}
          </li>
          <li className='flex items-center gap-2'>
            <MousePointerClick className='h-4 w-4' />
            {t('onboarding.features.zones')}
          </li>
          <li className='flex items-center gap-2'>
            <ChefHat className='h-4 w-4' />
            {t('onboarding.features.recipes')}
          </li>
        </ul>
        <div className='mt-4 text-sm space-y-2'>
          <div>
            <Link to='/instructions' className='underline text-primary'>
              {t('onboarding.instructions')}
            </Link>
          </div>
          <div>
            <Link
              to='/support'
              className='inline-flex items-center gap-1 font-medium text-primary-text hover:underline'
            >
              <Heart className='h-3.5 w-3.5 fill-current' />
              {t('onboarding.supportLink')}
            </Link>
          </div>
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
