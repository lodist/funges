import { createFileRoute, notFound } from '@tanstack/react-router';
import CropPage from '@/pages/CropPage';
import { cropOfPath, pathLanguage } from '@/lib/seo-pages';

// A public crop page in another language (/de/huerta/pflanzen/tomate), for
// search: the path sets the language.
export const Route = createFileRoute('/$lang_/huerta_/$page_/$id')({
  beforeLoad: ({ location }) => {
    if (!pathLanguage(location.pathname) || !cropOfPath(location.pathname))
      throw notFound();
  },
  component: CropPage,
});
