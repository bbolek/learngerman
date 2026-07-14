import { getDb } from '@/db/client';
import { levelForXp, type XpKind } from '@/logic/xp';

export interface XpTotals {
  /** Lifetime earned XP (positive events only) — drives the level. */
  lifetime: number;
  /** Earned minus spent — what streak repair can draw on. */
  balance: number;
}

export interface XpGrant {
  amount: number;
  totals: XpTotals;
  level: number;
  /** Set when this grant pushed the lifetime total over a level threshold. */
  leveledUp: boolean;
}

export async function xpTotals(): Promise<XpTotals> {
  const row = await getDb().getFirstAsync<{ lifetime: number | null; balance: number | null }>(
    `SELECT SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS lifetime,
            SUM(amount) AS balance
     FROM xp_events`
  );
  return { lifetime: row?.lifetime ?? 0, balance: row?.balance ?? 0 };
}

/** Positive XP earned on one `YYYY-MM-DD` day (feeds the XP daily quest). */
export async function xpEarnedOnDay(day: string): Promise<number> {
  const row = await getDb().getFirstAsync<{ total: number | null }>(
    'SELECT SUM(amount) AS total FROM xp_events WHERE day = ? AND amount > 0',
    [day]
  );
  return row?.total ?? 0;
}

/**
 * Award XP. Returns the new totals plus whether a level boundary was crossed
 * so callers can fire the level-up celebration.
 */
export async function grantXp(kind: XpKind, amount: number, now: Date): Promise<XpGrant> {
  if (amount <= 0) throw new Error(`grantXp needs a positive amount, got ${amount}`);
  const db = getDb();
  const before = await xpTotals();
  await db.runAsync(
    'INSERT INTO xp_events (kind, amount, day, created_at) VALUES (?, ?, ?, ?)',
    [kind, amount, now.toISOString().slice(0, 10), now.toISOString()]
  );
  const lifetime = before.lifetime + amount;
  const level = levelForXp(lifetime);
  return {
    amount,
    totals: { lifetime, balance: before.balance + amount },
    level,
    leveledUp: level > levelForXp(before.lifetime),
  };
}

/**
 * Spend from the balance (negative ledger row). Lifetime XP — and with it the
 * level — is untouched. Returns false when the balance is too small.
 */
export async function spendXp(kind: XpKind, amount: number, now: Date): Promise<boolean> {
  if (amount <= 0) throw new Error(`spendXp needs a positive amount, got ${amount}`);
  const { balance } = await xpTotals();
  if (balance < amount) return false;
  await getDb().runAsync(
    'INSERT INTO xp_events (kind, amount, day, created_at) VALUES (?, ?, ?, ?)',
    [kind, -amount, now.toISOString().slice(0, 10), now.toISOString()]
  );
  return true;
}
