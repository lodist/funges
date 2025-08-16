import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UIState {
  // Theme
  isDarkMode: boolean;

  // Layout
  sidebarOpen: boolean;
  sidebarWidth: number;

  // Loading states
  isLoading: boolean;
  loadingMessage: string;

  // Notifications
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration?: number;
  }>;

  // Modal states
  activeModal: string | null;

  // Actions
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setLoading: (loading: boolean, message?: string) => void;
  addNotification: (
    notification: Omit<UIState['notifications'][0], 'id'>
  ) => void;
  removeNotification: (id: string) => void;
  setActiveModal: (modalId: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Initial state
      isDarkMode: false,
      sidebarOpen: true,
      sidebarWidth: 80,
      isLoading: false,
      loadingMessage: '',
      notifications: [],
      activeModal: null,

      // Actions
      toggleDarkMode: () => set(state => ({ isDarkMode: !state.isDarkMode })),

      setDarkMode: (isDark: boolean) => set({ isDarkMode: isDark }),

      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

      setSidebarWidth: (width: number) => set({ sidebarWidth: width }),

      setLoading: (loading: boolean, message: string = '') =>
        set({ isLoading: loading, loadingMessage: message }),

      addNotification: notification => {
        const id = Date.now().toString();
        const newNotification = { ...notification, id };

        set(state => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-remove notification after duration (default: 5000ms)
        const duration = notification.duration || 5000;
        setTimeout(() => {
          get().removeNotification(id);
        }, duration);
      },

      removeNotification: (id: string) =>
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        })),

      setActiveModal: (modalId: string | null) => set({ activeModal: modalId }),
    }),
    {
      name: 'funges-ui-storage',
      partialize: state => ({
        isDarkMode: state.isDarkMode,
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
      }),
    }
  )
);
