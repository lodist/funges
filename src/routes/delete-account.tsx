import { createFileRoute } from '@tanstack/react-router';
import DeleteAccountPage from '@/pages/DeleteAccountPage';

export const Route = createFileRoute('/delete-account')({
  component: DeleteAccountPage,
});
