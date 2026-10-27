import { createFileRoute } from '@tanstack/react-router';
import { FrontC } from '@/pages/FrontMocks';

// A draft of the shared front page (design branch only).
export const Route = createFileRoute('/front-c')({
  component: FrontC,
});
