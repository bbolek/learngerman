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

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('vocab-reminders', {
      name: 'Vokabel-Erinnerungen',
      importance: Notifications.AndroidImportance.DEFAULT,
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
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
    scheduled++;
  }
  return scheduled > 0 || times.length === 0 ? 'scheduled' : 'no-words';
}
