import { getDb } from '@/db/client';
import { schedule, type CardState, type Rating } from '@/logic/sm2';

export interface ReviewCard {
  lemma_id: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  level: string;
  gloss: string;
  example_de: string | null;
  example_en: string | null;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}

const CARD_SELECT = `
  SELECT s.lemma_id, l.lemma, l.pos, l.gender, l.plural, l.level,
         s.ease, s.interval_days, s.reps, s.lapses,
         (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss,
         (SELECT example_de FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS example_de,
         (SELECT example_en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS example_en
  FROM srs_state s
  JOIN lemmas l ON l.id = s.lemma_id
  JOIN user_saved_words w ON w.lemma_id = s.lemma_id AND w.learned_at IS NULL`;

/** Cards due now (learned before) plus up to `newLimit` never-reviewed cards.
 * Words the user has marked "Learned" are excluded from both. */
export async function buildQueue(
  now: Date,
  sessionCap: number,
  newLimit: number
): Promise<ReviewCard[]> {
  const db = getDb();
  const endOfDay = now.toISOString().slice(0, 10) + 'T23:59:59.999Z';
  const due = await db.getAllAsync<ReviewCard>(
    `${CARD_SELECT}
     WHERE s.due_at <= ? AND s.last_reviewed_at IS NOT NULL
     ORDER BY s.due_at LIMIT ?`,
    [endOfDay, sessionCap]
  );
  const fresh = await db.getAllAsync<ReviewCard>(
    `${CARD_SELECT}
     WHERE s.last_reviewed_at IS NULL
     ORDER BY s.lemma_id LIMIT ?`,
    [newLimit]
  );
  return [...due, ...fresh];
}

export async function dueCounts(now: Date): Promise<{ due: number; fresh: number }> {
  const db = getDb();
  const endOfDay = now.toISOString().slice(0, 10) + 'T23:59:59.999Z';
  const due = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM srs_state s
     JOIN user_saved_words w ON w.lemma_id = s.lemma_id AND w.learned_at IS NULL
     WHERE s.due_at <= ? AND s.last_reviewed_at IS NOT NULL`,
    [endOfDay]
  );
  const fresh = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM srs_state s
     JOIN user_saved_words w ON w.lemma_id = s.lemma_id AND w.learned_at IS NULL
     WHERE s.last_reviewed_at IS NULL`
  );
  return { due: due?.c ?? 0, fresh: fresh?.c ?? 0 };
}

/** Apply a rating: reschedule, log, bump daily activity. Returns new state. */
export async function applyRating(
  card: { lemma_id: number } & CardState,
  rating: Rating,
  now: Date
): Promise<CardState & { dueAt: Date }> {
  const db = getDb();
  const { next, dueAt } = schedule(
    { ease: card.ease, intervalDays: card.intervalDays, reps: card.reps, lapses: card.lapses },
    rating,
    now
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE srs_state SET ease = ?, interval_days = ?, reps = ?, lapses = ?,
        due_at = ?, last_reviewed_at = ? WHERE lemma_id = ?`,
      [next.ease, next.intervalDays, next.reps, next.lapses, dueAt.toISOString(), now.toISOString(), card.lemma_id]
    );
    await db.runAsync(
      `INSERT INTO review_log (lemma_id, rating, reviewed_at, interval_before, interval_after)
       VALUES (?, ?, ?, ?, ?)`,
      [card.lemma_id, rating, now.toISOString(), card.intervalDays, next.intervalDays]
    );
    const day = now.toISOString().slice(0, 10);
    await db.runAsync(
      `INSERT INTO daily_activity (day, reviews_done) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET reviews_done = reviews_done + 1`,
      [day]
    );
  });
  return { ...next, dueAt };
}

export interface DayActivity {
  day: string;
  reviews_done: number;
  quiz_done: number;
  words_saved: number;
}

export async function recentActivity(days: number, now: Date): Promise<DayActivity[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return getDb().getAllAsync<DayActivity>(
    'SELECT day, reviews_done, quiz_done, words_saved FROM daily_activity WHERE day >= ? ORDER BY day',
    [since]
  );
}

/** Consecutive active days ending today or yesterday. */
export async function currentStreak(now: Date): Promise<number> {
  const rows = await getDb().getAllAsync<{ day: string }>(
    'SELECT day FROM daily_activity WHERE reviews_done > 0 OR quiz_done > 0 OR words_saved > 0 ORDER BY day DESC LIMIT 400'
  );
  const active = new Set(rows.map((r) => r.day));
  const DAY = 24 * 60 * 60 * 1000;
  let cursor = now.getTime();
  const today = now.toISOString().slice(0, 10);
  if (!active.has(today)) cursor -= DAY; // streak may still be alive from yesterday
  let streak = 0;
  for (;;) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    if (!active.has(day)) break;
    streak++;
    cursor -= DAY;
  }
  return streak;
}
