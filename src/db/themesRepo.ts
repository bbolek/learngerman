import { THEMES, type Theme } from '@/data/themes.generated';
import { getDb } from '@/db/client';

export { THEMES, type Theme };

export interface ThemeWordRow {
  lemma_id: number;
  lemma: string;
  pos: string;
  level: string;
  gender: string | null;
  gloss: string;
  saved: boolean;
}

export function getTheme(slug: string): Theme | undefined {
  return THEMES.find((t) => t.slug === slug);
}

const key = (lemma: string, pos: string) => `${lemma}|${pos}`;

/**
 * "lemma|pos" keys of every saved word, so the theme list can show progress
 * from a single query instead of one per theme.
 */
export async function savedThemeKeys(): Promise<Set<string>> {
  const rows = await getDb().getAllAsync<{ lemma: string; pos: string }>(
    'SELECT l.lemma, l.pos FROM user_saved_words w JOIN lemmas l ON l.id = w.lemma_id'
  );
  return new Set(rows.map((r) => key(r.lemma, r.pos)));
}

/** Resolve a theme's words to dictionary rows (gloss, gender, saved state), in theme order. */
export async function themeWords(theme: Theme): Promise<ThemeWordRow[]> {
  const db = getDb();
  const lemmas = [...new Set(theme.words.map((w) => w.lemma))];
  const placeholders = lemmas.map(() => '?').join(',');
  const rows = await db.getAllAsync<{
    lemma_id: number;
    lemma: string;
    pos: string;
    gender: string | null;
    gloss: string | null;
    saved: number;
  }>(
    `SELECT l.id AS lemma_id, l.lemma, l.pos, l.gender,
            (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss,
            EXISTS(SELECT 1 FROM user_saved_words w WHERE w.lemma_id = l.id) AS saved
     FROM lemmas l WHERE l.lemma IN (${placeholders})`,
    lemmas
  );

  const byKey = new Map(rows.map((r) => [key(r.lemma, r.pos), r]));
  const out: ThemeWordRow[] = [];
  for (const w of theme.words) {
    const r = byKey.get(key(w.lemma, w.pos));
    if (r) out.push({ ...r, gloss: r.gloss ?? '', level: w.level, saved: r.saved === 1 });
  }
  return out;
}
