import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { pickNotificationWord } from '@/db/vocabRepo';
import { computeUpcomingFireTimes, type NotificationSchedule } from '@/logic/notificationTimes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const HORIZON_DAYS = 7;
// v2: the original channel shipped with DEFAULT importance, and Android locks a
// channel's importance after creation — a new id is the only way to raise it on
// devices that already created the old channel.
const CHANNEL_ID = 'vocab-reminders-v2';
const LEGACY_CHANNEL_ID = 'vocab-reminders';
// iOS caps pending local notifications at 64; stay under it. At a 30-minute
// interval in a 12-hour window this buffers ~2.5 days between app opens
// (the buffer is also topped up whenever the app returns to the foreground).
const MAX_PENDING = 60;

export type NotificationScheduleStatus = 'scheduled' | 'disabled' | 'permission-denied' | 'no-words';

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Cancels all pending local notifications and reschedules the next
 * `MAX_PENDING` slots within `HORIZON_DAYS`, each filled with a word pick
 * (saved words in rotation, falling back to random dictionary words).
 * Returns a status so the settings UI can surface silent failure modes —
 * a denied system permission used to look exactly like a working setup.
 */
export async function rescheduleNotifications(
  schedule: NotificationSchedule,
  now: Date
): Promise<NotificationScheduleStatus> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!schedule.enabled) return 'disabled';

  const granted = await requestNotificationPermission();
  if (!granted) return 'permission-denied';

  // HIGH importance so reminders surface as heads-up banners while the app is
  // backgrounded; DEFAULT only drops them silently into the tray.
  if (Platform.OS === 'android') {
    await Notifications.deleteNotificationChannelAsync(LEGACY_CHANNEL_ID).catch(() => {});
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Vokabel-Erinnerungen',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const times = computeUpcomingFireTimes(schedule, now, { horizonDays: HORIZON_DAYS, max: MAX_PENDING });
  let scheduled = 0;
  for (const date of times) {
    const word = await pickNotificationWord();
    if (!word) break; // empty dictionary — cannot happen in practice

    const article = word.gender === 'm' ? 'der ' : word.gender === 'f' ? 'die ' : word.gender === 'n' ? 'das ' : '';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${article}${word.lemma}`,
        body: word.example_de ? `${word.gloss} — ${word.example_de}` : word.gloss,
        data: { lemmaId: word.lemma_id },
      },
      // channelId routes Android delivery through the channel above; without it
      // notifications land on expo's auto-created fallback channel. Exact
      // delivery while the device dozes additionally needs SCHEDULE_EXACT_ALARM
      // (declared in app.json) — without it Android 12+ downgrades these alarms
      // to inexact ones that Doze defers for hours once the app is backgrounded.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
    });
    scheduled++;
  }
  return scheduled > 0 || times.length === 0 ? 'scheduled' : 'no-words';
}
