/**
 * Anki-flavored SM-2 scheduler. Pure functions — `now` is always injected;
 * no Date.now() so tests fully control time.
 */

export type Rating = 0 | 1 | 2 | 3; // Again, Hard, Good, Easy

export interface CardState {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export interface ScheduleResult {
  next: CardState;
  dueAt: Date;
}

export const MIN_EASE = 1.3;
export const MAX_INTERVAL_DAYS = 365;
const AGAIN_MINUTES = 10;
const FUZZ = 0.05;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic ±5% fuzz derived from state so due dates don't clump. */
function fuzzFactor(state: CardState, rating: Rating): number {
  const seed = (state.reps * 7 + state.lapses * 13 + rating * 3 + Math.round(state.ease * 100)) % 100;
  return 1 + FUZZ * ((seed / 50) - 1); // 0.95 .. 1.05
}

export function schedule(state: CardState, rating: Rating, now: Date): ScheduleResult {
  const s = { ...state };

  if (rating === 0) {
    // Again: relearn in-session, drop ease, reset run of successful reps
    const next: CardState = {
      ease: Math.max(MIN_EASE, s.ease - 0.2),
      intervalDays: 0,
      reps: 0,
      lapses: s.lapses + 1,
    };
    return { next, dueAt: new Date(now.getTime() + AGAIN_MINUTES * 60 * 1000) };
  }

  let ease = s.ease;
  let interval: number;

  if (rating === 1) {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = s.reps === 0 ? 1 : s.intervalDays * 1.2;
  } else if (rating === 2) {
    interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : s.intervalDays * ease;
  } else {
    ease = ease + 0.15;
    interval = s.reps === 0 ? 3 : s.intervalDays * ease * 1.3;
  }

  interval = Math.min(MAX_INTERVAL_DAYS, interval * fuzzFactor(s, rating));
  if (interval >= 1) interval = Math.round(interval);
  if (interval < 1) interval = 1;

  const next: CardState = {
    ease,
    intervalDays: interval,
    reps: s.reps + 1,
    lapses: s.lapses,
  };
  return { next, dueAt: new Date(now.getTime() + interval * DAY_MS) };
}

/** Preview label for rating buttons: "10 Min", "1 Tag", "3 Tage"… */
export function previewInterval(state: CardState, rating: Rating, now: Date): string {
  if (rating === 0) return `${AGAIN_MINUTES} Min`;
  const { dueAt } = schedule(state, rating, now);
  const days = Math.round((dueAt.getTime() - now.getTime()) / DAY_MS);
  if (days <= 1) return '1 Tag';
  if (days < 30) return `${days} Tage`;
  if (days < 360) return `${Math.round(days / 30)} Mon.`;
  return '1 Jahr';
}

export type SrsPhase = 'new' | 'learning' | 'review';

export function phaseOf(state: CardState): SrsPhase {
  if (state.reps === 0 && state.lapses === 0) return 'new';
  if (state.intervalDays < 21) return 'learning';
  return 'review';
}
