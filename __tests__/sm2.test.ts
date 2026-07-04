import { MIN_EASE, phaseOf, previewInterval, schedule, type CardState } from '@/logic/sm2';

const NOW = new Date('2026-07-04T10:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const fresh: CardState = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };

function daysUntil(due: Date): number {
  return (due.getTime() - NOW.getTime()) / DAY_MS;
}

describe('schedule', () => {
  it('Again: resets reps, counts a lapse, drops ease, due in 10 minutes', () => {
    const state: CardState = { ease: 2.5, intervalDays: 10, reps: 3, lapses: 0 };
    const { next, dueAt } = schedule(state, 0, NOW);
    expect(next.reps).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.ease).toBeCloseTo(2.3);
    expect(dueAt.getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
  });

  it('ease never drops below the floor', () => {
    const state: CardState = { ease: 1.35, intervalDays: 5, reps: 2, lapses: 4 };
    expect(schedule(state, 0, NOW).next.ease).toBe(MIN_EASE);
    expect(schedule(state, 1, NOW).next.ease).toBe(MIN_EASE);
  });

  it('first Good: 1 day', () => {
    const { next, dueAt } = schedule(fresh, 2, NOW);
    expect(next.reps).toBe(1);
    expect(next.intervalDays).toBe(1);
    expect(daysUntil(dueAt)).toBe(1);
  });

  it('second Good: 3 days', () => {
    const s1 = schedule(fresh, 2, NOW).next;
    const { next } = schedule(s1, 2, NOW);
    expect(next.intervalDays).toBe(3);
  });

  it('mature Good multiplies by ease', () => {
    const state: CardState = { ease: 2.5, intervalDays: 10, reps: 5, lapses: 0 };
    const { next } = schedule(state, 2, NOW);
    expect(next.intervalDays).toBeGreaterThanOrEqual(Math.round(10 * 2.5 * 0.95));
    expect(next.intervalDays).toBeLessThanOrEqual(Math.round(10 * 2.5 * 1.05));
    expect(next.ease).toBe(2.5);
  });

  it('Hard grows slowly and drops ease', () => {
    const state: CardState = { ease: 2.5, intervalDays: 10, reps: 5, lapses: 0 };
    const { next } = schedule(state, 1, NOW);
    expect(next.ease).toBeCloseTo(2.35);
    expect(next.intervalDays).toBeLessThanOrEqual(13);
    expect(next.intervalDays).toBeGreaterThanOrEqual(11);
  });

  it('first Easy: 3 days and ease bonus', () => {
    const { next } = schedule(fresh, 3, NOW);
    expect(next.intervalDays).toBe(3);
    expect(next.ease).toBeCloseTo(2.65);
  });

  it('interval caps at 365 days', () => {
    const state: CardState = { ease: 2.5, intervalDays: 300, reps: 9, lapses: 0 };
    const { next } = schedule(state, 3, NOW);
    expect(next.intervalDays).toBe(365);
  });

  it('is deterministic for identical input', () => {
    const state: CardState = { ease: 2.2, intervalDays: 14, reps: 4, lapses: 1 };
    expect(schedule(state, 2, NOW)).toEqual(schedule(state, 2, NOW));
  });
});

describe('previewInterval', () => {
  it('labels each rating', () => {
    expect(previewInterval(fresh, 0, NOW)).toBe('10 Min');
    expect(previewInterval(fresh, 2, NOW)).toBe('1 Tag');
    expect(previewInterval(fresh, 3, NOW)).toBe('3 Tage');
  });
});

describe('phaseOf', () => {
  it('classifies new / learning / review', () => {
    expect(phaseOf(fresh)).toBe('new');
    expect(phaseOf({ ease: 2.5, intervalDays: 3, reps: 2, lapses: 0 })).toBe('learning');
    expect(phaseOf({ ease: 2.5, intervalDays: 30, reps: 6, lapses: 0 })).toBe('review');
  });
});
