/**
 * Pure logic for turning a game/duel miss into an SRS nudge. No RN imports,
 * no Date.now() — `now` is injected so jest fully controls time.
 *
 * A miss in an arcade round is a softer signal than a deliberate "Nochmal"
 * during review: the word resurfaces soon, but its whole rep history isn't
 * wiped and it isn't counted as a hard lapse.
 */

import { MIN_EASE, type CardState } from '@/logic/sm2';

/** Ease drop applied on a miss — half of a review "Again" (0.2). */
export const MISTAKE_EASE_PENALTY = 0.1;

/**
 * New card state after a game/duel miss: soften the ease and force the card
 * back into relearning (interval 0), but keep the run of reps and the lapse
 * count so genuine review history survives.
 */
export function softLapse(state: CardState): CardState {
  return {
    ease: Math.max(MIN_EASE, state.ease - MISTAKE_EASE_PENALTY),
    intervalDays: 0,
    reps: state.reps,
    lapses: state.lapses,
  };
}

/**
 * When a missed card should next be due: bring a not-yet-due card forward to
 * `now`, but never push an already-overdue card later than it already is —
 * missed words should surface at least as soon as they otherwise would.
 */
export function mistakeDueAt(currentDueAt: Date, now: Date): Date {
  return currentDueAt.getTime() < now.getTime() ? currentDueAt : now;
}
