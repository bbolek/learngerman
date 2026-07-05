import { getDb } from '@/db/client';

export interface SavedWordRow {
  lemma_id: number;
  lemma: string;
  gender: string | null;
  level: string;
  gloss: string;
  saved_at: string;
  learned_at: string | null;
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

export async function isLearned(lemmaId: number): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ learned_at: string | null }>(
    'SELECT learned_at FROM user_saved_words WHERE lemma_id = ?',
    [lemmaId]
  );
  return row?.learned_at != null;
}

export async function setLearned(lemmaId: number, learned: boolean, now: Date): Promise<void> {
  await getDb().runAsync('UPDATE user_saved_words SET learned_at = ? WHERE lemma_id = ?', [
    learned ? now.toISOString() : null,
    lemmaId,
  ]);
}

export async function listSavedWords(includeLearned = false): Promise<SavedWordRow[]> {
  return getDb().getAllAsync<SavedWordRow>(
    `SELECT w.lemma_id, l.lemma, l.gender, l.level, w.saved_at, w.learned_at,
            s.reps, s.due_at, s.lapses,
            (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss
     FROM user_saved_words w
     JOIN lemmas l ON l.id = w.lemma_id
     LEFT JOIN srs_state s ON s.lemma_id = w.lemma_id
     WHERE ? = 1 OR w.learned_at IS NULL
     ORDER BY s.due_at IS NULL, s.due_at, w.saved_at DESC`,
    [includeLearned ? 1 : 0]
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

const NOTIF_WORD_SELECT = `
  SELECT w.lemma_id, l.lemma, l.gender,
         (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss,
         (SELECT example_de FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS example_de,
         (SELECT example_en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS example_en
  FROM user_saved_words w
  JOIN lemmas l ON l.id = w.lemma_id
  WHERE w.learned_at IS NULL`;

const NOTIF_CURSOR_KEY = 'notif_cursor_lemma_id';

/**
 * Rotates through saved, not-learned words in lemma_id order (wrapping
 * around), one pick per call — used to fill notification content without
 * repeating a word until the whole saved list has cycled through.
 */
export async function pickNotificationWord(): Promise<NotificationWord | null> {
  const db = getDb();
  const cursorRow = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM user_meta WHERE key = ?',
    [NOTIF_CURSOR_KEY]
  );
  const cursor = cursorRow ? Number(cursorRow.value) : 0;

  const picked =
    (await db.getFirstAsync<NotificationWord>(
      `${NOTIF_WORD_SELECT} AND w.lemma_id > ? ORDER BY w.lemma_id LIMIT 1`,
      [cursor]
    )) ??
    (await db.getFirstAsync<NotificationWord>(`${NOTIF_WORD_SELECT} ORDER BY w.lemma_id LIMIT 1`));

  if (!picked) return null;
  await db.runAsync('INSERT OR REPLACE INTO user_meta (key, value) VALUES (?, ?)', [
    NOTIF_CURSOR_KEY,
    String(picked.lemma_id),
  ]);
  return picked;
}
