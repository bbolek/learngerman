/**
 * Pure grid/bucketing logic for the stats screen's activity heatmap and the
 * upcoming-review forecast. No RN imports, no clocks — `now` is injected.
 * Day keys are UTC `YYYY-MM-DD`, matching daily_activity and due_at storage.
 */

export const HEATMAP_WEEKS = 15;
export const FORECAST_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Monday-first weekday index (Mo=0 … So=6) of a day key. */
export function weekdayIndex(day: string): number {
  return (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;
}

export interface HeatDay {
  day: string;
  count: number;
  /** 0 = none … 3 = most intense, relative to the window's max. */
  level: 0 | 1 | 2 | 3;
}

/** One column per week, exactly 7 entries (Mo…So); future days are null. */
export type HeatWeek = (HeatDay | null)[];

function levelFor(count: number, max: number): HeatDay['level'] {
  if (count <= 0) return 0;
  const ratio = count / max;
  if (ratio > 2 / 3) return 3;
  if (ratio > 1 / 3) return 2;
  return 1;
}

/**
 * Week columns for the last `weeks` weeks, ending with the week that
 * contains today. Intensity is relative to the busiest day in the window.
 */
export function buildHeatmap(
  counts: Map<string, number>,
  now: Date,
  weeks: number = HEATMAP_WEEKS
): HeatWeek[] {
  const todayKey = dayKeyOf(now);
  const monday = addDays(now, -weekdayIndex(todayKey));
  const start = addDays(monday, -(weeks - 1) * 7);

  let max = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const key = dayKeyOf(addDays(start, i));
    if (key > todayKey) break;
    max = Math.max(max, counts.get(key) ?? 0);
  }

  const grid: HeatWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const week: HeatWeek = [];
    for (let d = 0; d < 7; d++) {
      const key = dayKeyOf(addDays(start, w * 7 + d));
      if (key > todayKey) {
        week.push(null);
      } else {
        const count = counts.get(key) ?? 0;
        week.push({ day: key, count, level: levelFor(count, Math.max(max, 1)) });
      }
    }
    grid.push(week);
  }
  return grid;
}

export interface ForecastDay {
  day: string;
  count: number;
}

/**
 * Due timestamps → one bucket per day for the next `days` days. Overdue
 * cards fold into today (that's when they'll actually be reviewed); dates
 * beyond the horizon are dropped.
 */
export function bucketDueDates(
  dueDates: string[],
  now: Date,
  days: number = FORECAST_DAYS
): ForecastDay[] {
  const todayKey = dayKeyOf(now);
  const buckets = new Map<string, number>();
  const order: string[] = [];
  for (let i = 0; i < days; i++) {
    const key = dayKeyOf(addDays(now, i));
    buckets.set(key, 0);
    order.push(key);
  }
  for (const due of dueDates) {
    const key = due.slice(0, 10) < todayKey ? todayKey : due.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + 1);
  }
  return order.map((day) => ({ day, count: buckets.get(day)! }));
}

/** "Heute", "Morgen", then "Mo." style weekday shorts for forecast rows. */
const WEEKDAY_SHORT = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];

export function forecastLabel(day: string, todayKey: string): string {
  if (day === todayKey) return 'Heute';
  if (day === dayKeyOf(addDays(new Date(todayKey + 'T00:00:00Z'), 1))) return 'Morgen';
  return WEEKDAY_SHORT[weekdayIndex(day)];
}
