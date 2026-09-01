/// <reference types="vite/client" />

declare module 'virtual:pwa-register/react' {
  export function useRegisterSW(): {
    needRefresh: [boolean];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
