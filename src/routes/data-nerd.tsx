import { createFileRoute } from '@tanstack/react-router';
import DataNerdPage from '@/pages/DataNerdPage';

export const Route = createFileRoute('/data-nerd')({
  component: DataNerdPage,
});
