import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  hapticsEnabled: boolean;
  /** New cards introduced per day in review sessions. */
  dailyNewLimit: number;
  /** Max due cards per review session. */
  sessionCap: number;
  setThemePreference: (pref: ThemePreference) => void;
  setHapticsEnabled: (on: boolean) => void;
  setDailyNewLimit: (n: number) => void;
  setSessionCap: (n: number) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  themePreference: 'system',
  hapticsEnabled: true,
  dailyNewLimit: 10,
  sessionCap: 30,
  setThemePreference: (themePreference) => set({ themePreference }),
  setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
  setDailyNewLimit: (dailyNewLimit) => set({ dailyNewLimit }),
  setSessionCap: (sessionCap) => set({ sessionCap }),
}));
