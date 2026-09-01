import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The brand typefaces. One list, in src/lib/fonts.ts, imported here and by
// .storybook/preview.tsx so the two cannot drift.
import '@/lib/fonts';
import './index.css';
import './i18n';
import { initializeHtmlLocalization } from '@/lib/html-localization';
import '@/lib/pwa';
import { hydrateOfflineSources } from '@/lib/offlineCache';
import { useOfflineStore } from '@/store/offlineStore';
import { useMapStore } from '@/store/mapStore';

initializeHtmlLocalization();

async function bootstrap(): Promise<void> {
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
