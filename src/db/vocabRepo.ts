import { getDb } from '@/db/client';

export interface SavedWordRow {
  lemma_id: number;
  lemma: string;
  gender: string | null;
  level: string;
  gloss: string;
  saved_at: string;
  source: string;
  reps: number | null;
  due_at: string | null;
  lapses: number | null;
}

export async function isSaved(lemmaId: number): Promise<boolean> {
  const row = await getDb().getFirstAsync(
    'SELECT 1 FROM user_saved_words WHERE lemma_id = ?',
    [lemmaId]
  );
  return row != null;
}

export async function saveWord(lemmaId: number, now: Date): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR IGNORE INTO user_saved_words (lemma_id, saved_at) VALUES (?, ?)',
      [lemmaId, now.toISOString()]
    );
    // New card: due immediately so it can enter today's queue.
    await db.runAsync(
      `INSERT OR IGNORE INTO srs_state (lemma_id, ease, interval_days, reps, lapses, due_at)
       VALUES (?, 2.5, 0, 0, 0, ?)`,
      [lemmaId, now.toISOString()]
    );
    const day = now.toISOString().slice(0, 10);
    await db.runAsync(
      `INSERT INTO daily_activity (day, words_saved) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET words_saved = words_saved + 1`,
      [day]
    );
  });
}

export async function unsaveWord(lemmaId: number): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM srs_state WHERE lemma_id = ?', [lemmaId]);
    await db.runAsync('DELETE FROM user_saved_words WHERE lemma_id = ?', [lemmaId]);
  });
}

export async function listSavedWords(): Promise<SavedWordRow[]> {
  return getDb().getAllAsync<SavedWordRow>(
    `SELECT w.lemma_id, l.lemma, l.gender, l.level, w.saved_at, w.source,
            s.reps, s.due_at, s.lapses,
            (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss
     FROM user_saved_words w
     JOIN lemmas l ON l.id = w.lemma_id
     LEFT JOIN srs_state s ON s.lemma_id = w.lemma_id
     ORDER BY s.due_at IS NULL, s.due_at, w.saved_at DESC`
  );
}

export async function savedCount(): Promise<number> {
  const row = await getDb().getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM user_saved_words'
  );
  return row?.c ?? 0;
}

export interface NotificationWord {
  lemma_id: number;
  lemma: string;
  gender: string | null;
  gloss: string;
  example_de: string | null;
  example_en: string | null;
}

/**
 * Picks a random word for notification content. Limited to A1–B1 so push
 * reminders stay approachable; B2/C1 entries are dictionary-only.
 * Saved words get no special treatment.
 */
export async function pickNotificationWord(): Promise<NotificationWord | null> {
  return (
    (await getDb().getFirstAsync<NotificationWord>(
      `SELECT l.id AS lemma_id, l.lemma, l.gender,
              s.en AS gloss, s.example_de, s.example_en
       FROM lemmas l JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1
       WHERE l.level IN ('A1', 'A2', 'B1')
       ORDER BY RANDOM() LIMIT 1`
    )) ?? null
  );
}
