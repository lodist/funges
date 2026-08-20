/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OFFLINE_MAPS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:pwa-register/react' {
  export function useRegisterSW(): {
    needRefresh: [boolean];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
