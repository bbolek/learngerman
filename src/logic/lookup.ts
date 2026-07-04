import { asciiFold, normalize } from '@/logic/normalize';

/** Minimal query surface — expo-sqlite satisfies it directly; tests adapt better-sqlite3. */
export interface QueryDb {
  getAllAsync<T>(sql: string, params: (string | number)[]): Promise<T[]>;
}

export interface LemmaHit {
  lemmaId: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  level: string;
  freqRank: number | null;
  /** First sense gloss for the result row. */
  gloss: string;
  /** Set when matched through an inflected form ("gemacht"). */
  matchedForm?: string;
  matchedTag?: string;
  via: 'lemma' | 'form' | 'prefix' | 'english';
}

const LEMMA_COLS = `l.id AS lemmaId, l.lemma, l.pos, l.gender, l.plural, l.level,
  l.freq_rank AS freqRank`;

function plainFold(s: string): string {
  return s
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .replaceAll('ß', 's');
}

async function attachGlosses(db: QueryDb, hits: Omit<LemmaHit, 'gloss'>[]): Promise<LemmaHit[]> {
  if (hits.length === 0) return [];
  const ids = [...new Set(hits.map((h) => h.lemmaId))];
  const rows = await db.getAllAsync<{ lemma_id: number; en: string }>(
    `SELECT lemma_id, en FROM senses WHERE lemma_id IN (${ids.map(() => '?').join(',')})
     ORDER BY sense_order`,
    ids
  );
  const gloss = new Map<number, string>();
  for (const r of rows) if (!gloss.has(r.lemma_id)) gloss.set(r.lemma_id, r.en);
  return hits.map((h) => ({ ...h, gloss: gloss.get(h.lemmaId) ?? '' }));
}

/** German → English: exact lemma, exact inflected form, then prefix fallback. */
export async function lookupGerman(db: QueryDb, input: string, limit = 20): Promise<LemmaHit[]> {
  const q = normalize(input);
  if (!q) return [];
  const fold = asciiFold(q);
  const plain = plainFold(q);

  const lemmaRows = await db.getAllAsync<
    Omit<LemmaHit, 'gloss' | 'via'> & { exact: number }
  >(
    `SELECT ${LEMMA_COLS}, (l.lemma_norm = ?) AS exact FROM lemmas l
     WHERE l.lemma_norm = ? OR l.lemma_fold = ? OR l.lemma_plain = ?
     ORDER BY exact DESC, l.freq_rank IS NULL, l.freq_rank`,
    [q, q, fold, plain]
  );

  const formRows = await db.getAllAsync<Omit<LemmaHit, 'gloss' | 'via'> & {
    matchedForm: string;
    matchedTag: string;
    exact: number;
  }>(
    `SELECT ${LEMMA_COLS}, f.form AS matchedForm, MIN(f.tag) AS matchedTag,
            MAX(f.form_norm = ?) AS exact
     FROM forms f JOIN lemmas l ON l.id = f.lemma_id
     WHERE f.form_norm = ? OR f.form_fold = ? OR f.form_plain = ?
     GROUP BY l.id
     ORDER BY exact DESC, l.freq_rank IS NULL, l.freq_rank`,
    [q, q, fold, plain]
  );

  // Precision tiers: exact-spelling lemma > exact-spelling form >
  // umlaut-folded lemma > umlaut-folded form ("fährt" → fahren, not Fahrt;
  // "fahrt" → Fahrt first, then fahren).
  const seen = new Set<number>();
  const hits: Omit<LemmaHit, 'gloss'>[] = [];
  const push = (r: (typeof lemmaRows)[number] | (typeof formRows)[number], via: 'lemma' | 'form') => {
    if (seen.has(r.lemmaId)) return;
    seen.add(r.lemmaId);
    const { exact: _exact, ...rest } = r;
    hits.push({ ...rest, via });
  };
  for (const r of lemmaRows) if (r.exact) push(r, 'lemma');
  for (const r of formRows) if (r.exact) push(r, 'form');
  for (const r of lemmaRows) if (!r.exact) push(r, 'lemma');
  for (const r of formRows) if (!r.exact) push(r, 'form');

  if (hits.length === 0 && q.length >= 3) {
    const prefixRows = await db.getAllAsync<Omit<LemmaHit, 'gloss' | 'via'>>(
      `SELECT ${LEMMA_COLS} FROM lemmas l
       WHERE l.lemma_norm LIKE ? OR l.lemma_fold LIKE ? OR l.lemma_plain LIKE ?
       ORDER BY l.freq_rank IS NULL, l.freq_rank LIMIT ?`,
      [`${q}%`, `${fold}%`, `${plain}%`, limit]
    );
    for (const r of prefixRows) {
      if (seen.has(r.lemmaId)) continue;
      seen.add(r.lemmaId);
      hits.push({ ...r, via: 'prefix' });
    }
  }

  return attachGlosses(db, hits.slice(0, limit));
}

/** English → German via FTS5 word match, LIKE substring fallback. */
export async function lookupEnglish(db: QueryDb, input: string, limit = 20): Promise<LemmaHit[]> {
  const q = normalize(input);
  if (!q) return [];

  let rows: (Omit<LemmaHit, 'via'> & { en: string })[] = [];
  const ftsQuery = `"${q.replaceAll('"', '')}"`;
  try {
    rows = await db.getAllAsync(
      `SELECT ${LEMMA_COLS}, s.en FROM senses_fts
       JOIN senses s ON s.id = senses_fts.rowid
       JOIN lemmas l ON l.id = s.lemma_id
       WHERE senses_fts MATCH ?
       ORDER BY rank, l.freq_rank IS NULL, l.freq_rank LIMIT ?`,
      [ftsQuery, limit]
    );
  } catch {
    // FTS unavailable/odd query — fall through to LIKE
  }
  if (rows.length === 0 && q.length >= 3) {
    rows = await db.getAllAsync(
      `SELECT ${LEMMA_COLS}, s.en FROM senses s
       JOIN lemmas l ON l.id = s.lemma_id
       WHERE s.en_norm LIKE ?
       ORDER BY l.freq_rank IS NULL, l.freq_rank LIMIT ?`,
      [`%${q}%`, limit]
    );
  }

  const seen = new Set<number>();
  const hits: LemmaHit[] = [];
  for (const r of rows) {
    if (seen.has(r.lemmaId)) continue;
    seen.add(r.lemmaId);
    const { en, ...rest } = r;
    hits.push({ ...rest, gloss: en, via: 'english' });
  }
  return hits;
}
