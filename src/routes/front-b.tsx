import { createFileRoute } from '@tanstack/react-router';
import { FrontB } from '@/pages/FrontMocks';

// A draft of the shared front page (design branch only).
export const Route = createFileRoute('/front-b')({
  component: FrontB,
});
