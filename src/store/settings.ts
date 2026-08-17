import { create } from 'zustand';

import { loadSettings, persistSettings } from '@/db/settingsRepo';
import { resolveLocale, setLocale } from '@/i18n';
import { isLocale, type LanguagePreference } from '@/i18n/locales';
import { levelsUpTo, type CefrLevel } from '@/logic/levels';
import {
  rescheduleNotifications,
  type NotificationScheduleStatus,
} from '@/services/notificationScheduler';
import { seedThemeFilter } from '@/store/themeFilter';
import { colorThemes, DEFAULT_COLOR_THEME, type ColorThemeName } from '@/ui/theme';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  /** UI language; 'system' follows the device, falling back to German. */
  uiLanguage: LanguagePreference;
  /** Primary/accent color pair applied on top of the light/dark palette. */
  colorTheme: ColorThemeName;
  hapticsEnabled: boolean;
  /** Short sound cues for answers and reward moments. */
  soundEnabled: boolean;
  /** Turn familiar review cards into typed recall (cloze / type-the-word). */
  typedRecall: boolean;
  /** New cards introduced per day in review sessions. */
  dailyNewLimit: number;
  /** Max due cards per review session. */
  sessionCap: number;
  /** Vocab reminder notifications. */
  notificationsEnabled: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  notificationDays: number[];
  notificationStartHour: number;
  notificationEndHour: number;
  notificationIntervalMinutes: number;
  /** Outcome of the last scheduling attempt — surfaces silent failures. */
  notificationStatus: NotificationScheduleStatus | 'unknown';
  /** First-run interactive guide has been shown (or skipped). */
  hasSeenTour: boolean;
  /** Multiplayer display name; '' falls back to the device name. */
  userName: string;
  /**
   * Sprachniveau (CEFR) — recommendations, games and lists show content up
   * to this level. Set manually here or raised by the Einstufungstest.
   */
  userLevel: CefrLevel;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Re-fill the pending-notification buffer (called on app foreground). */
  refreshNotifications: () => void;
  setThemePreference: (pref: ThemePreference) => void;
  setUiLanguage: (pref: LanguagePreference) => void;
  setColorTheme: (name: ColorThemeName) => void;
  setHapticsEnabled: (on: boolean) => void;
  setSoundEnabled: (on: boolean) => void;
  setTypedRecall: (on: boolean) => void;
  setDailyNewLimit: (n: number) => void;
  setSessionCap: (n: number) => void;
  setNotificationsEnabled: (on: boolean) => void;
  setNotificationDays: (days: number[]) => void;
  setNotificationStartHour: (h: number) => void;
  setNotificationEndHour: (h: number) => void;
  setNotificationIntervalMinutes: (m: number) => void;
  setHasSeenTour: (seen: boolean) => void;
  setUserName: (name: string) => void;
  setUserLevel: (level: CefrLevel) => void;
}

function persist(get: () => SettingsState) {
  const {
    themePreference,
    uiLanguage,
    colorTheme,
    hapticsEnabled,
    soundEnabled,
    typedRecall,
    dailyNewLimit,
    sessionCap,
    notificationsEnabled,
    notificationDays,
    notificationStartHour,
    notificationEndHour,
    notificationIntervalMinutes,
    hasSeenTour,
    userName,
    userLevel,
  } = get();
  persistSettings({
    themePreference,
    uiLanguage,
    colorTheme,
    hapticsEnabled,
    soundEnabled,
    typedRecall,
    dailyNewLimit,
    sessionCap,
    notificationsEnabled,
    notificationDays,
    notificationStartHour,
    notificationEndHour,
    notificationIntervalMinutes,
    hasSeenTour,
    userName,
    userLevel,
  }).catch(() => {});
}

function reschedule(
  get: () => SettingsState,
  set: (partial: Partial<SettingsState>) => void
) {
  const { notificationsEnabled, notificationDays, notificationStartHour, notificationEndHour, notificationIntervalMinutes } =
    get();
  rescheduleNotifications(
    {
      enabled: notificationsEnabled,
      days: notificationDays,
      startHour: notificationStartHour,
      endHour: notificationEndHour,
      intervalMinutes: notificationIntervalMinutes,
    },
    new Date(),
    levelsUpTo(get().userLevel)
  )
    .then((notificationStatus) => set({ notificationStatus }))
    .catch(() => {});
}

export const useSettings = create<SettingsState>((set, get) => ({
  themePreference: 'system',
  uiLanguage: 'system',
  colorTheme: DEFAULT_COLOR_THEME,
  hapticsEnabled: true,
  soundEnabled: true,
  typedRecall: true,
  dailyNewLimit: 10,
  sessionCap: 30,
  notificationsEnabled: false,
  notificationDays: [0, 1, 2, 3, 4, 5, 6],
  notificationStartHour: 9,
  notificationEndHour: 21,
  notificationIntervalMinutes: 180,
  notificationStatus: 'unknown',
  hasSeenTour: false,
  userName: '',
  userLevel: 'A1',
  hydrated: false,

  hydrate: async () => {
    const stored = await loadSettings();
    // Guard against unknown color names from older backups or future versions.
    if (stored.colorTheme && !(stored.colorTheme in colorThemes)) delete stored.colorTheme;
    // Same for a language a newer build shipped and this one doesn't have.
    if (stored.uiLanguage && stored.uiLanguage !== 'system' && !isLocale(stored.uiLanguage)) {
      delete stored.uiLanguage;
    }
    set({ ...stored, hydrated: true });
    setLocale(resolveLocale(get().uiLanguage));
    seedThemeFilter(get().userLevel);
    if (get().notificationsEnabled) reschedule(get, set);
  },
  refreshNotifications: () => {
    if (get().notificationsEnabled) reschedule(get, set);
  },
  setThemePreference: (themePreference) => {
    set({ themePreference });
    persist(get);
  },
  setUiLanguage: (uiLanguage) => {
    set({ uiLanguage });
    persist(get);
    setLocale(resolveLocale(uiLanguage));
    // Reminder copy is built from the catalog, so re-render the queue.
    if (get().notificationsEnabled) reschedule(get, set);
  },
  setColorTheme: (colorTheme) => {
    set({ colorTheme });
    persist(get);
  },
  setHapticsEnabled: (hapticsEnabled) => {
    set({ hapticsEnabled });
    persist(get);
  },
  setSoundEnabled: (soundEnabled) => {
    set({ soundEnabled });
    persist(get);
  },
  setTypedRecall: (typedRecall) => {
    set({ typedRecall });
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
  setNotificationsEnabled: (notificationsEnabled) => {
    set({ notificationsEnabled });
    persist(get);
    reschedule(get, set);
  },
  setNotificationDays: (notificationDays) => {
    set({ notificationDays });
    persist(get);
    reschedule(get, set);
  },
  setNotificationStartHour: (notificationStartHour) => {
    set({ notificationStartHour });
    persist(get);
    reschedule(get, set);
  },
  setNotificationEndHour: (notificationEndHour) => {
    set({ notificationEndHour });
    persist(get);
    reschedule(get, set);
  },
  setNotificationIntervalMinutes: (notificationIntervalMinutes) => {
    set({ notificationIntervalMinutes });
    persist(get);
    reschedule(get, set);
  },
  setHasSeenTour: (hasSeenTour) => {
    set({ hasSeenTour });
    persist(get);
  },
  setUserName: (userName) => {
    set({ userName });
    persist(get);
  },
  setUserLevel: (userLevel) => {
    set({ userLevel });
    persist(get);
    seedThemeFilter(userLevel);
    // Reminder words follow the level too.
    if (get().notificationsEnabled) reschedule(get, set);
  },
}));
