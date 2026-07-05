import { computeUpcomingFireTimes, type NotificationSchedule } from '@/logic/notificationTimes';

// Saturday, 2026-07-04, 08:00 local.
const NOW = new Date(2026, 6, 4, 8, 0, 0);

const everyDay: NotificationSchedule = {
  enabled: true,
  days: [0, 1, 2, 3, 4, 5, 6],
  startHour: 9,
  endHour: 21,
  intervalMinutes: 180,
};

describe('computeUpcomingFireTimes', () => {
  it('returns empty when disabled', () => {
    expect(computeUpcomingFireTimes({ ...everyDay, enabled: false }, NOW, { horizonDays: 3, max: 5 })).toEqual([]);
  });

  it('returns empty when no days selected', () => {
    expect(computeUpcomingFireTimes({ ...everyDay, days: [] }, NOW, { horizonDays: 3, max: 5 })).toEqual([]);
  });

  it('starts within today\'s window, spaced by the interval', () => {
    const times = computeUpcomingFireTimes(everyDay, NOW, { horizonDays: 1, max: 10 });
    expect(times.map((t) => t.getHours())).toEqual([9, 12, 15, 18]);
    expect(times.every((t) => t.getDate() === NOW.getDate())).toBe(true);
  });

  it('excludes times before or equal to now', () => {
    const later = new Date(2026, 6, 4, 12, 0, 0);
    const times = computeUpcomingFireTimes(everyDay, later, { horizonDays: 1, max: 10 });
    expect(times.map((t) => t.getHours())).toEqual([15, 18]);
  });

  it('skips days not in schedule.days', () => {
    // Only Mondays (1).
    const mondaysOnly: NotificationSchedule = { ...everyDay, days: [1] };
    const times = computeUpcomingFireTimes(mondaysOnly, NOW, { horizonDays: 7, max: 20 });
    expect(times.every((t) => t.getDay() === 1)).toBe(true);
    expect(times.length).toBeGreaterThan(0);
  });

  it('respects the max cap', () => {
    const times = computeUpcomingFireTimes(everyDay, NOW, { horizonDays: 30, max: 3 });
    expect(times).toHaveLength(3);
  });

  it('returns empty when endHour <= startHour', () => {
    const bad: NotificationSchedule = { ...everyDay, startHour: 20, endHour: 10 };
    expect(computeUpcomingFireTimes(bad, NOW, { horizonDays: 3, max: 5 })).toEqual([]);
  });
});
