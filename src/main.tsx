import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { initializeHtmlLocalization } from '@/lib/html-localization';
import '@/lib/pwa';
import { hydrateOfflineSources } from '@/lib/offlineCache';
import { useOfflineStore } from '@/store/offlineStore';

// Re-register any regions cached in a previous session before the map mounts.
// Best-effort: if IndexedDB is unavailable (e.g. private browsing), the app
// still runs fully online — offline maps just won't be available.
hydrateOfflineSources()
  .then(() => useOfflineStore.getState().refresh())
  .catch(err => {
    // Block body (not a bare console expression): vite-plugin-remove-console
    // strips the statement in prod, leaving a valid empty block.
    console.warn('Offline cache hydration skipped:', err);
  });

// Import Why Did You Render in development
if (process.env.NODE_ENV === 'development') {
  import('./lib/wdyr');
}

// Initialize HTML and manifest localization
initializeHtmlLocalization();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// React mounts immediately behind the inline overlay, so map and data loading
// overlap with the deliberate startup transition instead of waiting for it.
// Start after a paint opportunity to guarantee 750 ms of visible wordmark even
// when the module is already cached.
const splash = document.getElementById('app-splash');
requestAnimationFrame(() => window.setTimeout(() => splash?.remove(), 750));
