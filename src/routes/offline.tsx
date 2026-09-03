import { createFileRoute, redirect } from '@tanstack/react-router';
import OfflineMapsPage from '@/pages/OfflineMapsPage';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';

export const Route = createFileRoute('/offline')({
  beforeLoad: () => {
    if (!shouldShowOfflineFeatures) {
      throw redirect({ to: '/' });
    }
  },
  component: OfflineMapsPage,
});
