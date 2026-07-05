import { getDb } from '@/db/client';

export interface LemmaDetail {
  id: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  verb_aux: string | null;
  verb_partizip2: string | null;
  verb_praeteritum: string | null;
  level: string;
}

export interface SenseRow {
  id: number;
  sense_order: number;
  en: string;
  example_de: string | null;
  example_en: string | null;
  note: string | null;
}

export interface FormRow {
  form: string;
  tag: string;
}

export async function getLemma(id: number): Promise<LemmaDetail | null> {
  return (
    (await getDb().getFirstAsync<LemmaDetail>(
      `SELECT id, lemma, pos, gender, plural, verb_aux, verb_partizip2, verb_praeteritum, level
       FROM lemmas WHERE id = ?`,
      [id]
    )) ?? null
  );
}

export async function getSenses(lemmaId: number): Promise<SenseRow[]> {
  return getDb().getAllAsync<SenseRow>(
    `SELECT id, sense_order, en, example_de, example_en, note
     FROM senses WHERE lemma_id = ? ORDER BY sense_order`,
    [lemmaId]
  );
}

export interface ExampleRow {
  tag: string;
  de: string;
  en: string;
}

export async function getExamples(lemmaId: number): Promise<ExampleRow[]> {
  return getDb().getAllAsync<ExampleRow>(
    'SELECT tag, de, en FROM examples WHERE lemma_id = ? ORDER BY sort_order',
    [lemmaId]
  );
}

export async function getForms(lemmaId: number): Promise<FormRow[]> {
  return getDb().getAllAsync<FormRow>(
    `SELECT form, tag FROM forms WHERE lemma_id = ? ORDER BY id`,
    [lemmaId]
  );
}

/**
 * Bundled Noto emoji SVG for a lemma (lemma_images content table), or null.
 * Guarded: the table only exists from content version 4 on, and a failed
 * in-place content update may leave an older schema behind — images are
 * decorative, so degrade to "no image" instead of crashing.
 */
export async function getLemmaImage(lemmaId: number): Promise<string | null> {
  try {
    const row = await getDb().getFirstAsync<{ svg: string }>(
      'SELECT svg FROM lemma_images WHERE lemma_id = ?',
      [lemmaId]
    );
    return row?.svg ?? null;
  } catch {
    return null;
  }
}

/** Images for a result list, keyed by lemma id (missing ids simply absent). */
export async function getLemmaImages(lemmaIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (lemmaIds.length === 0) return map;
  try {
    const rows = await getDb().getAllAsync<{ lemma_id: number; svg: string }>(
      `SELECT lemma_id, svg FROM lemma_images WHERE lemma_id IN (${lemmaIds.map(() => '?').join(',')})`,
      lemmaIds
    );
    for (const r of rows) map.set(r.lemma_id, r.svg);
  } catch {
    // pre-images schema — render without thumbnails
  }
  return map;
}

export async function getWordOfTheDay(daySeed: string): Promise<{
  id: number;
  lemma: string;
  gender: string | null;
  gloss: string;
  example_de: string | null;
  example_en: string | null;
} | null> {
  // Deterministic per day: hash the ISO date onto the lemma count.
  const row = await getDb().getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM lemmas');
  if (!row || row.c === 0) return null;
  let hash = 0;
  for (const ch of daySeed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const offset = hash % row.c;
  return (
    (await getDb().getFirstAsync(
      `SELECT l.id, l.lemma, l.gender, s.en AS gloss, s.example_de, s.example_en
       FROM lemmas l JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1
       ORDER BY l.id LIMIT 1 OFFSET ?`,
      [offset]
    )) ?? null
  );
}
