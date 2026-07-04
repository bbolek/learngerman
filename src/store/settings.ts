import { create } from 'zustand';

import { loadSettings, persistSettings } from '@/db/settingsRepo';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  hapticsEnabled: boolean;
  /** New cards introduced per day in review sessions. */
  dailyNewLimit: number;
  /** Max due cards per review session. */
  sessionCap: number;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setThemePreference: (pref: ThemePreference) => void;
  setHapticsEnabled: (on: boolean) => void;
  setDailyNewLimit: (n: number) => void;
  setSessionCap: (n: number) => void;
}

function persist(get: () => SettingsState) {
  const { themePreference, hapticsEnabled, dailyNewLimit, sessionCap } = get();
  persistSettings({ themePreference, hapticsEnabled, dailyNewLimit, sessionCap }).catch(() => {});
}

export const useSettings = create<SettingsState>((set, get) => ({
  themePreference: 'system',
  hapticsEnabled: true,
  dailyNewLimit: 10,
  sessionCap: 30,
  hydrated: false,

  hydrate: async () => {
    const stored = await loadSettings();
    set({ ...stored, hydrated: true });
  },
  setThemePreference: (themePreference) => {
    set({ themePreference });
    persist(get);
  },
  setHapticsEnabled: (hapticsEnabled) => {
    set({ hapticsEnabled });
    persist(get);
  },
  setDailyNewLimit: (dailyNewLimit) => {
    set({ dailyNewLimit });
    persist(get);
  },
  setSessionCap: (sessionCap) => {
    set({ sessionCap });
    persist(get);
  },
}));
