import { MISTAKE_EASE_PENALTY, mistakeDueAt, softLapse } from '@/logic/mistakes';
import { MIN_EASE, type CardState } from '@/logic/sm2';

const card = (over: Partial<CardState> = {}): CardState => ({
  ease: 2.5,
  intervalDays: 40,
  reps: 6,
  lapses: 1,
  ...over,
});

describe('softLapse', () => {
  it('drops ease by the mistake penalty and forces relearning', () => {
    const next = softLapse(card());
    expect(next.ease).toBeCloseTo(2.5 - MISTAKE_EASE_PENALTY);
    expect(next.intervalDays).toBe(0);
  });

  it('keeps rep history and lapse count (softer than a review "Again")', () => {
    const next = softLapse(card({ reps: 8, lapses: 3 }));
    expect(next.reps).toBe(8);
    expect(next.lapses).toBe(3);
  });

  it('never lets ease fall below the floor', () => {
    const next = softLapse(card({ ease: MIN_EASE }));
    expect(next.ease).toBe(MIN_EASE);
  });
});

describe('mistakeDueAt', () => {
  const now = new Date('2026-07-12T10:00:00Z');

  it('brings a not-yet-due card forward to now', () => {
    const due = new Date('2026-07-20T00:00:00Z');
    expect(mistakeDueAt(due, now)).toBe(now);
  });

  it('never delays an already-overdue card', () => {
    const due = new Date('2026-07-05T00:00:00Z');
    expect(mistakeDueAt(due, now)).toBe(due);
  });
});
