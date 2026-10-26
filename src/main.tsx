import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The brand typefaces. One list, in src/lib/fonts.ts, imported here and by
// .storybook/preview.tsx so the two cannot drift.
import '@/lib/fonts';
import './index.css';
import { i18nReady } from './i18n';
import { initializeHtmlLocalization } from '@/lib/html-localization';
import '@/lib/pwa';
import { hydrateOfflineSources } from '@/lib/offlineCache';
import { useOfflineStore } from '@/store/offlineStore';
import { useMapStore } from '@/store/mapStore';

initializeHtmlLocalization();

async function bootstrap(): Promise<void> {
  // The visitor's language loads beside the offline maps; a failed load still
  // renders (with the keys) rather than leave the page blank.
  // (A block body: the build strips console calls.)
  const translations = i18nReady.catch(err => {
    console.warn('Translations failed to load:', err);
  });
  // Do not let MapLibre race IndexedDB/OPFS hydration. A network-backed PMTiles
  // instance created first cannot render a downloaded archive in airplane mode.
  try {
    await hydrateOfflineSources();
    if (!navigator.onLine) {
      const [longitude, latitude] = useMapStore.getState().center;
      await useOfflineStore
        .getState()
        .activateForCoordinate(longitude, latitude);
    }
  } catch (err) {
    console.warn('Offline cache hydration skipped:', err);
  }

  await translations;
  void useOfflineStore.getState().initialize();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();

const splash = document.getElementById('app-splash');
requestAnimationFrame(() => window.setTimeout(() => splash?.remove(), 1000));
