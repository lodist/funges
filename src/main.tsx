import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Brand typefaces, self-hosted so --font-sans/--font-serif/--font-mono in
// index.css actually render instead of falling back to system fonts.
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource/source-code-pro/400.css';
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

// Initialize HTML and manifest localization
initializeHtmlLocalization();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// React mounts immediately behind the inline overlay, so map and data loading
// overlap with the deliberate startup transition instead of waiting for it.
// Start after a paint opportunity to guarantee 1000 ms of visible brand lockup
// even when the module is already cached.
const splash = document.getElementById('app-splash');
requestAnimationFrame(() => window.setTimeout(() => splash?.remove(), 1000));
