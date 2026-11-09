import { createFileRoute } from '@tanstack/react-router';
import PlayPage from '@/pages/PlayPage';

// The router splits each page into its own chunk: the game loads when opened.
export const Route = createFileRoute('/play')({
  component: PlayPage,
});
