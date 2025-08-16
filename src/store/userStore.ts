import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export interface UserPreferences {
  language: 'en' | 'it';
  units: 'metric' | 'imperial';
  notifications: {
    enabled: boolean;
    foragingAlerts: boolean;
    weatherUpdates: boolean;
  };
  privacy: {
    shareLocation: boolean;
    shareData: boolean;
  };
}

export interface UserState {
  // User data
  userId: string | null;
  username: string | null;

  // Location
  location: UserLocation | null;
  locationPermission: 'granted' | 'denied' | 'prompt';

  // Preferences
  preferences: UserPreferences;

  // Session
  isAuthenticated: boolean;
  lastActive: number;

  // Actions
  setUser: (userId: string, username: string) => void;
  clearUser: () => void;
  setLocation: (location: UserLocation) => void;
  setLocationPermission: (permission: UserState['locationPermission']) => void;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  setLanguage: (language: UserPreferences['language']) => void;
  setUnits: (units: UserPreferences['units']) => void;
  toggleNotifications: (type: keyof UserPreferences['notifications']) => void;
  updatePrivacySettings: (
    settings: Partial<UserPreferences['privacy']>
  ) => void;
  updateLastActive: () => void;
}

const defaultPreferences: UserPreferences = {
  language: 'en',
  units: 'metric',
  notifications: {
    enabled: true,
    foragingAlerts: true,
    weatherUpdates: false,
  },
  privacy: {
    shareLocation: true,
    shareData: false,
  },
};

export const useUserStore = create<UserState>()(
  persist(
    set => ({
      // Initial state
      userId: null,
      username: null,
      location: null,
      locationPermission: 'prompt',
      preferences: defaultPreferences,
      isAuthenticated: false,
      lastActive: Date.now(),

      // Actions
      setUser: (userId: string, username: string) =>
        set({
          userId,
          username,
          isAuthenticated: true,
          lastActive: Date.now(),
        }),

      clearUser: () =>
        set({
          userId: null,
          username: null,
          isAuthenticated: false,
        }),

      setLocation: (location: UserLocation) => set({ location }),

      setLocationPermission: (permission: UserState['locationPermission']) =>
        set({ locationPermission: permission }),

      updatePreferences: (newPreferences: Partial<UserPreferences>) =>
        set(state => ({
          preferences: { ...state.preferences, ...newPreferences },
        })),

      setLanguage: (language: UserPreferences['language']) =>
        set(state => ({
          preferences: { ...state.preferences, language },
        })),

      setUnits: (units: UserPreferences['units']) =>
        set(state => ({
          preferences: { ...state.preferences, units },
        })),

      toggleNotifications: (type: keyof UserPreferences['notifications']) =>
        set(state => ({
          preferences: {
            ...state.preferences,
            notifications: {
              ...state.preferences.notifications,
              [type]: !state.preferences.notifications[type],
            },
          },
        })),

      updatePrivacySettings: (settings: Partial<UserPreferences['privacy']>) =>
        set(state => ({
          preferences: {
            ...state.preferences,
            privacy: { ...state.preferences.privacy, ...settings },
          },
        })),

      updateLastActive: () => set({ lastActive: Date.now() }),
    }),
    {
      name: 'funges-user-storage',
      partialize: state => ({
        userId: state.userId,
        username: state.username,
        preferences: state.preferences,
        locationPermission: state.locationPermission,
      }),
    }
  )
);
