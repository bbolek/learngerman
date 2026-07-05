export interface NotificationSchedule {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Local hour the window opens, 0–23. */
  startHour: number;
  /** Local hour the window closes, 0–23 (exclusive). Must be > startHour. */
  endHour: number;
  intervalMinutes: number;
}

/**
 * Next `max` fire times within the schedule's day/hour window, spaced
 * `intervalMinutes` apart, starting strictly after `now`. Scans up to
 * `horizonDays` calendar days ahead. All times are local (device timezone).
 */
export function computeUpcomingFireTimes(
  schedule: NotificationSchedule,
  now: Date,
  opts: { horizonDays: number; max: number }
): Date[] {
  if (!schedule.enabled || schedule.days.length === 0 || schedule.intervalMinutes <= 0) return [];
  if (schedule.endHour <= schedule.startHour) return [];

  const times: Date[] = [];
  for (let d = 0; d < opts.horizonDays && times.length < opts.max; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    if (!schedule.days.includes(day.getDay())) continue;

    const windowStart = new Date(day);
    windowStart.setHours(schedule.startHour, 0, 0, 0);
    const windowEnd = new Date(day);
    windowEnd.setHours(schedule.endHour, 0, 0, 0);

    for (
      let t = new Date(windowStart);
      t < windowEnd && times.length < opts.max;
      t = new Date(t.getTime() + schedule.intervalMinutes * 60_000)
    ) {
      if (t > now) times.push(new Date(t));
    }
  }
  return times;
}
