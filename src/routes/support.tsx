import { createFileRoute, redirect } from '@tanstack/react-router';
import { isPlayApp } from '@/lib/platform';
import SupportPage from '@/pages/SupportPage';

export const Route = createFileRoute('/support')({
  // Play's payments policy: no donation page inside the Play app.
  beforeLoad: () => {
    if (isPlayApp()) throw redirect({ to: '/', replace: true });
  },
  component: SupportPage,
});
