import { create } from 'zustand';

import { loadSettings, persistSettings } from '@/db/settingsRepo';
import {
  rescheduleNotifications,
  type NotificationScheduleStatus,
} from '@/services/notificationScheduler';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  hapticsEnabled: boolean;
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
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Re-fill the pending-notification buffer (called on app foreground). */
  refreshNotifications: () => void;
  setThemePreference: (pref: ThemePreference) => void;
  setHapticsEnabled: (on: boolean) => void;
  setTypedRecall: (on: boolean) => void;
  setDailyNewLimit: (n: number) => void;
  setSessionCap: (n: number) => void;
  setNotificationsEnabled: (on: boolean) => void;
  setNotificationDays: (days: number[]) => void;
  setNotificationStartHour: (h: number) => void;
  setNotificationEndHour: (h: number) => void;
  setNotificationIntervalMinutes: (m: number) => void;
  setHasSeenTour: (seen: boolean) => void;
}

function persist(get: () => SettingsState) {
  const {
    themePreference,
    hapticsEnabled,
    typedRecall,
    dailyNewLimit,
    sessionCap,
    notificationsEnabled,
    notificationDays,
    notificationStartHour,
    notificationEndHour,
    notificationIntervalMinutes,
    hasSeenTour,
  } = get();
  persistSettings({
    themePreference,
    hapticsEnabled,
    typedRecall,
    dailyNewLimit,
    sessionCap,
    notificationsEnabled,
    notificationDays,
    notificationStartHour,
    notificationEndHour,
    notificationIntervalMinutes,
    hasSeenTour,
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
    new Date()
  )
    .then((notificationStatus) => set({ notificationStatus }))
    .catch(() => {});
}

export const useSettings = create<SettingsState>((set, get) => ({
  themePreference: 'system',
  hapticsEnabled: true,
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
  hydrated: false,

  hydrate: async () => {
    const stored = await loadSettings();
    set({ ...stored, hydrated: true });
    if (get().notificationsEnabled) reschedule(get, set);
  },
  refreshNotifications: () => {
    if (get().notificationsEnabled) reschedule(get, set);
  },
  setThemePreference: (themePreference) => {
    set({ themePreference });
    persist(get);
  },
  setHapticsEnabled: (hapticsEnabled) => {
    set({ hapticsEnabled });
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
}));
