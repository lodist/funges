import { createFileRoute } from '@tanstack/react-router';
import OfflineMapsPage from '@/pages/OfflineMapsPage';

export const Route = createFileRoute('/offline')({
  component: OfflineMapsPage,
});
