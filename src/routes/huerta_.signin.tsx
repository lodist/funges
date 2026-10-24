import { createFileRoute, redirect } from '@tanstack/react-router';
import HuertaSignInPage from '@/pages/HuertaSignInPage';
import { shouldShowHuerta } from '@/lib/feature-flags';

export const Route = createFileRoute('/huerta_/signin')({
  beforeLoad: () => {
    if (!shouldShowHuerta) {
      throw redirect({ to: '/map' });
    }
  },
  component: HuertaSignInPage,
});
