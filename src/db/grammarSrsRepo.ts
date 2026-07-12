import { getDb } from '@/db/client';
import { ratingFromScore } from '@/logic/grammarSrs';
import { schedule, type CardState } from '@/logic/sm2';

const NEW_CARD: CardState = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };

interface StateRow {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}

/**
 * Reschedule a grammar topic after a completed quiz round. The round's
 * accuracy becomes an SM-2 rating and the topic's card is scheduled with the
 * very same scheduler the vocab flashcards use, so grammar fades and
 * resurfaces on the same proven curve. Creates the card on first completion.
 */
export async function applyTopicResult(
  slug: string,
  correct: number,
  total: number,
  now: Date
): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<StateRow>(
    'SELECT ease, interval_days, reps, lapses FROM grammar_srs WHERE slug = ?',
    [slug]
  );
  const state: CardState = row
    ? { ease: row.ease, intervalDays: row.interval_days, reps: row.reps, lapses: row.lapses }
    : NEW_CARD;
  const { next, dueAt } = schedule(state, ratingFromScore(correct, total), now);
  await db.runAsync(
    `INSERT INTO grammar_srs (slug, ease, interval_days, reps, lapses, due_at, last_reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       ease = excluded.ease, interval_days = excluded.interval_days,
       reps = excluded.reps, lapses = excluded.lapses,
       due_at = excluded.due_at, last_reviewed_at = excluded.last_reviewed_at`,
    [slug, next.ease, next.intervalDays, next.reps, next.lapses, dueAt.toISOString(), now.toISOString()]
  );
}

/** Slugs of topics whose SRS card is due today (practised before, now ripe). */
export async function grammarDueSlugs(now: Date): Promise<Set<string>> {
  const endOfDay = now.toISOString().slice(0, 10) + 'T23:59:59.999Z';
  const rows = await getDb().getAllAsync<{ slug: string }>(
    `SELECT s.slug FROM grammar_srs s
     JOIN grammar_topics t ON t.slug = s.slug
     WHERE s.due_at <= ? AND s.last_reviewed_at IS NOT NULL`,
    [endOfDay]
  );
  return new Set(rows.map((r) => r.slug));
}
