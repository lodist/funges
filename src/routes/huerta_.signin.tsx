import { createFileRoute } from '@tanstack/react-router';
import HuertaSignInPage from '@/pages/HuertaSignInPage';

export const Route = createFileRoute('/huerta_/signin')({
  component: HuertaSignInPage,
});
