import { createFileRoute } from '@tanstack/react-router';
import DataPage from '@/pages/DataPage';

export const Route = createFileRoute('/data')({
  component: DataPage,
});
