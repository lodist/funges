import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from '@/components/theme-provider';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import './i18n';
import { useDailySpeciesRefresh } from '@/hooks/use-daily-species-refresh';
import { shouldShowOfflineFeatures } from '@/lib/feature-flags';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
  // Since we're using React Query, we don't want to call
  // your query loaders on the server. We'll let React Query
  // handle the data fetching on the client instead.
  defaultPreloadStaleTime: 0,
  basepath: import.meta.env.BASE_URL || '/',
});

function App() {
  const { i18n } = useTranslation('common');
  useDailySpeciesRefresh();

  useEffect(() => {
    // Set default language
    const savedLanguage = localStorage.getItem('language') || 'en';
    i18n.changeLanguage(savedLanguage);
  }, [i18n]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
        {shouldShowOfflineFeatures && <OfflineIndicator />}
        <ReactQueryDevtools initialIsOpen={false} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
