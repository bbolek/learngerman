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

const HORIZON_DAYS = 3;
const MAX_PENDING = 30;

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Cancels all pending local notifications and reschedules the next
 * `MAX_PENDING` slots within `HORIZON_DAYS`, each filled with a rotating
 * saved-word pick. No-ops (after clearing) when the schedule is disabled or
 * there are no eligible (saved, not-learned) words.
 */
export async function rescheduleNotifications(
  schedule: NotificationSchedule,
  now: Date
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!schedule.enabled) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('vocab-reminders', {
      name: 'Vokabel-Erinnerungen',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const times = computeUpcomingFireTimes(schedule, now, { horizonDays: HORIZON_DAYS, max: MAX_PENDING });
  for (const date of times) {
    const word = await pickNotificationWord();
    if (!word) return; // nothing saved (yet) — stop, don't schedule empty reminders

    const article = word.gender === 'm' ? 'der ' : word.gender === 'f' ? 'die ' : word.gender === 'n' ? 'das ' : '';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${article}${word.lemma}`,
        body: word.example_de ? `${word.gloss} — ${word.example_de}` : word.gloss,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
}
