import { createFileRoute } from '@tanstack/react-router';
import SettingsPage from '@/pages/SettingsPage';

// Huerta's Settings, public as Terra's (/settings): theme, language and help
// before anyone signs in.
export const Route = createFileRoute('/huerta_/settings')({
  component: SettingsPage,
});
