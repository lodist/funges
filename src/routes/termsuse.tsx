import { createFileRoute } from '@tanstack/react-router';
import TermsUsePage from '@/pages/TermsUsePage';

export const Route = createFileRoute('/termsuse')({
  component: TermsUsePage,
});
