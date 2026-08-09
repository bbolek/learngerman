import { getDb } from '@/db/client';

export interface ReadingTextRow {
  id: number;
  slug: string;
  title: string;
  level: string;
  teaser: string;
  word_count: number;
  /** Set when the user finished this text (join on reading_progress). */
  completed_at: string | null;
}

const TEXT_SELECT = `
  SELECT t.id, t.slug, t.title, t.level, t.teaser, t.word_count, p.completed_at
  FROM reading_texts t LEFT JOIN reading_progress p ON p.slug = t.slug`;

/**
 * All Leseecke texts easiest-first. Guarded like fetchImageWords: the
 * reading tables only exist from content version 6 on, so degrade to an
 * empty list instead of crashing on an older content schema.
 */
export async function listReadingTexts(): Promise<ReadingTextRow[]> {
  try {
    return await getDb().getAllAsync<ReadingTextRow>(`${TEXT_SELECT} ORDER BY t.sort_order`);
  } catch {
    return [];
  }
}

export interface ReadingParagraph {
  de: string;
  en: string;
}

export interface ReadingText extends ReadingTextRow {
  paragraphs: ReadingParagraph[];
}

export async function getReadingText(slug: string): Promise<ReadingText | null> {
  const db = getDb();
  let text: ReadingTextRow | null = null;
  try {
    text = await db.getFirstAsync<ReadingTextRow>(`${TEXT_SELECT} WHERE t.slug = ?`, [slug]);
  } catch {
    return null;
  }
  if (!text) return null;
  const paragraphs = await db.getAllAsync<ReadingParagraph>(
    'SELECT de, en FROM reading_paragraphs WHERE text_id = ? ORDER BY sort_order',
    [text.id]
  );
  return { ...text, paragraphs };
}

/**
 * Mark a text as read; bumps daily activity (feeds the streak) only on the
 * FIRST completion, which is also when the caller should award XP. Re-reads
 * return false and change nothing.
 */
export async function markTextCompleted(slug: string, now: Date): Promise<boolean> {
  const db = getDb();
  let first = false;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'INSERT OR IGNORE INTO reading_progress (slug, completed_at) VALUES (?, ?)',
      [slug, now.toISOString()]
    );
    first = res.changes > 0;
    if (first) {
      await db.runAsync(
        `INSERT INTO daily_activity (day, texts_read) VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET texts_read = texts_read + 1`,
        [now.toISOString().slice(0, 10)]
      );
    }
  });
  return first;
}
