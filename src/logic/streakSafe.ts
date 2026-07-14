/**
 * Streak insurance — pure planning logic (issue #25).
 * A "Streak-Retter" (freeze) retroactively marks a missed day as protected so
 * the streak survives. Day math works on ISO `YYYY-MM-DD` strings in UTC,
 * matching how daily_activity records days everywhere else.
 */

export const MAX_FREEZES = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDay(key: string, days: number): string {
  return dayKey(new Date(new Date(`${key}T00:00:00Z`).getTime() + days * DAY_MS));
}

/**
 * Consecutive counted days ending today or yesterday. `days` holds every day
 * that counts: real activity plus freeze-protected days.
 */
export function computeStreak(days: Set<string>, now: Date): number {
  let cursor = dayKey(now);
  if (!days.has(cursor)) cursor = shiftDay(cursor, -1); // may still be alive from yesterday
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

export interface FreezePlan {
  /** Missed days (oldest first) a freeze would have to cover. */
  gapDays: string[];
  /** Length of the streak that ended just before the gap. */
  lostStreak: number;
}

/**
 * The gap between the last counted day and today — the days insurance would
 * need to bridge. Empty gap ⇒ nothing to protect (active today/yesterday, or
 * no streak worth saving before the gap).
 */
export function freezePlan(days: Set<string>, now: Date): FreezePlan {
  const today = dayKey(now);
  const empty: FreezePlan = { gapDays: [], lostStreak: 0 };
  if (days.has(today) || days.has(shiftDay(today, -1))) return empty;

  // Walk back to the most recent counted day (bounded — a lapsed streak
  // older than the cap is not worth bridging anyway).
  const MAX_GAP = MAX_FREEZES + 1;
  const gapDays: string[] = [];
  let cursor = shiftDay(today, -1);
  for (let i = 0; i < MAX_GAP && !days.has(cursor); i++) {
    gapDays.unshift(cursor);
    cursor = shiftDay(cursor, -1);
  }
  if (!days.has(cursor)) return empty; // gap longer than anything we can bridge

  // Streak that would be revived, measured from the day before the gap.
  let lostStreak = 0;
  while (days.has(cursor)) {
    lostStreak++;
    cursor = shiftDay(cursor, -1);
  }
  if (lostStreak < 2) return empty; // a 1-day "streak" is not worth a freeze
  return { gapDays, lostStreak };
}
