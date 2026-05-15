import { createFileRoute } from '@tanstack/react-router';
import WorthForagingNowPage from '@/pages/WorthForagingNowPage';

export const Route = createFileRoute('/worth-foraging-now')({
  component: WorthForagingNowPage,
});
