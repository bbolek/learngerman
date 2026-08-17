import {
  bucketDueDates,
  buildHeatmap,
  dayKeyOf,
  FORECAST_DAYS,
  forecastLabel,
  HEATMAP_WEEKS,
  weekdayIndex,
} from '@/logic/heatmap';

// 2026-08-05 is a Wednesday.
const NOW = new Date('2026-08-05T14:30:00Z');

describe('weekdayIndex', () => {
  it('is Monday-first', () => {
    expect(weekdayIndex('2026-08-03')).toBe(0); // Monday
    expect(weekdayIndex('2026-08-05')).toBe(2); // Wednesday
    expect(weekdayIndex('2026-08-09')).toBe(6); // Sunday
  });
});

describe('buildHeatmap', () => {
  it('builds the full grid with today in the last column and the future null', () => {
    const grid = buildHeatmap(new Map(), NOW);
    expect(grid).toHaveLength(HEATMAP_WEEKS);
    for (const week of grid) expect(week).toHaveLength(7);

    const last = grid[HEATMAP_WEEKS - 1];
    expect(last[0]?.day).toBe('2026-08-03'); // Monday of the current week
    expect(last[2]?.day).toBe(dayKeyOf(NOW)); // today (Wednesday)
    expect(last[3]).toBeNull(); // tomorrow …
    expect(last[6]).toBeNull(); // … through Sunday

    // first column starts exactly HEATMAP_WEEKS-1 weeks before that Monday
    expect(grid[0][0]?.day).toBe('2026-04-27');
    // every non-null day is inside the window and consecutive
    expect(grid[0][6]?.day).toBe('2026-05-03');
  });

  it('scales levels relative to the busiest day', () => {
    const counts = new Map([
      ['2026-08-03', 30], // max → level 3
      ['2026-08-04', 15], // half → level 2
      ['2026-08-05', 5], // small → level 1
    ]);
    const grid = buildHeatmap(counts, NOW);
    const last = grid[HEATMAP_WEEKS - 1];
    expect(last[0]).toMatchObject({ count: 30, level: 3 });
    expect(last[1]).toMatchObject({ count: 15, level: 2 });
    expect(last[2]).toMatchObject({ count: 5, level: 1 });
    expect(grid[0][0]).toMatchObject({ count: 0, level: 0 });
  });

  it('an empty history yields level 0 everywhere without dividing by zero', () => {
    const grid = buildHeatmap(new Map(), NOW);
    for (const week of grid) {
      for (const day of week) {
        if (day) expect(day.level).toBe(0);
      }
    }
  });
});

describe('bucketDueDates', () => {
  it('folds overdue cards into today and drops dates beyond the horizon', () => {
    const days = bucketDueDates(
      [
        '2026-07-20T10:00:00.000Z', // long overdue → today
        '2026-08-05T09:00:00.000Z', // today
        '2026-08-06T09:00:00.000Z', // tomorrow
        '2026-08-06T22:00:00.000Z', // tomorrow again
        '2026-08-11T09:00:00.000Z', // last day inside the 7-day window
        '2026-08-12T09:00:00.000Z', // beyond → dropped
      ],
      NOW
    );
    expect(days).toHaveLength(FORECAST_DAYS);
    expect(days[0]).toEqual({ day: '2026-08-05', count: 2 });
    expect(days[1]).toEqual({ day: '2026-08-06', count: 2 });
    expect(days[6]).toEqual({ day: '2026-08-11', count: 1 });
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(5);
  });
});

describe('forecastLabel', () => {
  it('names today, tomorrow, then short weekdays', () => {
    const today = dayKeyOf(NOW);
    expect(forecastLabel('2026-08-05', today)).toEqual({ kind: 'today' });
    expect(forecastLabel('2026-08-06', today)).toEqual({ kind: 'tomorrow' });
    // Monday-first index: Friday is 4, Sunday 6.
    expect(forecastLabel('2026-08-07', today)).toEqual({ kind: 'weekday', index: 4 });
    expect(forecastLabel('2026-08-09', today)).toEqual({ kind: 'weekday', index: 6 });
  });
});
