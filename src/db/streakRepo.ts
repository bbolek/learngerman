import { getDb } from '@/db/client';
import { spendXp, xpTotals } from '@/db/xpRepo';
import { computeStreak, dayKey, freezePlan, MAX_FREEZES } from '@/logic/streakSafe';
import { STREAK_REPAIR_COST } from '@/logic/xp';

const FREEZES_KEY = 'streak_freezes';

/** Days that count toward the streak: real activity plus frozen days. */
export async function countedDays(): Promise<Set<string>> {
  const db = getDb();
  const active = await db.getAllAsync<{ day: string }>(
    `SELECT day FROM daily_activity
     WHERE reviews_done > 0 OR quiz_done > 0 OR words_saved > 0 OR games_played > 0
     ORDER BY day DESC LIMIT 500`
  );
  const frozen = await db.getAllAsync<{ day: string }>(
    'SELECT day FROM streak_freeze_days ORDER BY day DESC LIMIT 500'
  );
  return new Set([...active.map((r) => r.day), ...frozen.map((r) => r.day)]);
}

export async function frozenDays(): Promise<Set<string>> {
  const rows = await getDb().getAllAsync<{ day: string }>(
    'SELECT day FROM streak_freeze_days ORDER BY day DESC LIMIT 500'
  );
  return new Set(rows.map((r) => r.day));
}

export async function freezeCount(): Promise<number> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM user_meta WHERE key = ?',
    [FREEZES_KEY]
  );
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function setFreezeCount(n: number): Promise<void> {
  await getDb().runAsync('INSERT OR REPLACE INTO user_meta (key, value) VALUES (?, ?)', [
    FREEZES_KEY,
    String(Math.max(0, Math.min(MAX_FREEZES, n))),
  ]);
}

/** +1 Streak-Retter (capped). Returns true if one was actually added. */
export async function grantFreeze(): Promise<boolean> {
  const n = await freezeCount();
  if (n >= MAX_FREEZES) return false;
  await setFreezeCount(n + 1);
  return true;
}

export interface StreakState {
  streak: number;
  freezes: number;
  /** Set when autoProtect just spent freezes to bridge missed days. */
  justProtected: string[] | null;
  /** Set when the streak broke yesterday and XP repair is on the table. */
  repair: { lostStreak: number; cost: number; affordable: boolean } | null;
}

/**
 * The Home screen's one-stop streak call: bridge missed days with available
 * freezes automatically, otherwise surface the same-day XP repair offer.
 */
export async function streakState(now: Date): Promise<StreakState> {
  const days = await countedDays();
  let freezes = await freezeCount();
  let justProtected: string[] | null = null;
  let repair: StreakState['repair'] = null;

  const plan = freezePlan(days, now);
  if (plan.gapDays.length > 0 && plan.gapDays.length <= freezes) {
    const db = getDb();
    await db.withTransactionAsync(async () => {
      for (const day of plan.gapDays) {
        await db.runAsync(
          'INSERT OR IGNORE INTO streak_freeze_days (day, used_at) VALUES (?, ?)',
          [day, now.toISOString()]
        );
      }
    });
    freezes -= plan.gapDays.length;
    await setFreezeCount(freezes);
    plan.gapDays.forEach((d) => days.add(d));
    justProtected = plan.gapDays;
  } else if (plan.gapDays.length === 1) {
    // Exactly yesterday missed and no freeze left: one-tap XP repair, valid
    // only today (tomorrow the gap is 2 days and the plan no longer matches).
    const { balance } = await xpTotals();
    repair = {
      lostStreak: plan.lostStreak,
      cost: STREAK_REPAIR_COST,
      affordable: balance >= STREAK_REPAIR_COST,
    };
  }

  return { streak: computeStreak(days, now), freezes, justProtected, repair };
}

/** Pay XP to mark yesterday as protected. Returns the revived streak, or null. */
export async function repairStreak(now: Date): Promise<number | null> {
  const days = await countedDays();
  const plan = freezePlan(days, now);
  if (plan.gapDays.length !== 1) return null;
  if (!(await spendXp('streak_repair', STREAK_REPAIR_COST, now))) return null;
  await getDb().runAsync('INSERT OR IGNORE INTO streak_freeze_days (day, used_at) VALUES (?, ?)', [
    plan.gapDays[0],
    now.toISOString(),
  ]);
  days.add(plan.gapDays[0]);
  return computeStreak(days, now);
}

/** Milestone bookkeeping so each streak milestone celebrates exactly once. */
export async function lastCelebratedMilestone(): Promise<number> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    "SELECT value FROM user_meta WHERE key = 'last_streak_milestone'"
  );
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function setLastCelebratedMilestone(streak: number): Promise<void> {
  await getDb().runAsync('INSERT OR REPLACE INTO user_meta (key, value) VALUES (?, ?)', [
    'last_streak_milestone',
    String(streak),
  ]);
}

export { dayKey };
