import { getDb } from '@/db/client';

export interface PersistedSettings {
  themePreference?: 'system' | 'light' | 'dark';
  hapticsEnabled?: boolean;
  soundEnabled?: boolean;
  typedRecall?: boolean;
  dailyNewLimit?: number;
  sessionCap?: number;
  notificationsEnabled?: boolean;
  notificationDays?: number[];
  notificationStartHour?: number;
  notificationEndHour?: number;
  notificationIntervalMinutes?: number;
  hasSeenTour?: boolean;
  /** Multiplayer display name; '' falls back to the device name. */
  userName?: string;
}

const KEY = 'settings';

export async function loadSettings(): Promise<PersistedSettings> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM user_meta WHERE key = ?',
    [KEY]
  );
  if (!row) return {};
  try {
    return JSON.parse(row.value) as PersistedSettings;
  } catch {
    return {};
  }
}

export async function persistSettings(settings: PersistedSettings): Promise<void> {
  await getDb().runAsync('INSERT OR REPLACE INTO user_meta (key, value) VALUES (?, ?)', [
    KEY,
    JSON.stringify(settings),
  ]);
}
