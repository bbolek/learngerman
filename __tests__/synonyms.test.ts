import Database from 'better-sqlite3';
import * as path from 'node:path';

/** Synonym content checks against the real built DB. */
const db = new Database(path.join(__dirname, '../assets/db/dictionary.db'), { readonly: true });

function synonymsFor(lemma: string): { syn: string; note: string | null }[] {
  return db
    .prepare(
      `SELECT l2.lemma AS syn, s.note FROM synonyms s
       JOIN lemmas l ON l.id = s.lemma_id
       JOIN lemmas l2 ON l2.id = s.syn_lemma_id
       WHERE l.lemma = ? ORDER BY s.sort_order`
    )
    .all(lemma) as { syn: string; note: string | null }[];
}

describe('synonym content', () => {
  it('anfangen links to beginnen with a nuance note', () => {
    const syns = synonymsFor('anfangen');
    expect(syns.map((s) => s.syn)).toContain('beginnen');
    expect(syns.find((s) => s.syn === 'beginnen')?.note).toBeTruthy();
  });

  it('bekommen offers both a formal and a colloquial alternative', () => {
    const syns = synonymsFor('bekommen').map((s) => s.syn);
    expect(syns).toEqual(expect.arrayContaining(['erhalten', 'kriegen']));
  });

  it('every synonym resolves to an existing lemma (no dangling refs)', () => {
    const dangling = db
      .prepare(
        `SELECT COUNT(*) c FROM synonyms s
         LEFT JOIN lemmas h ON h.id = s.lemma_id
         LEFT JOIN lemmas t ON t.id = s.syn_lemma_id
         WHERE h.id IS NULL OR t.id IS NULL`
      )
      .get() as { c: number };
    expect(dangling.c).toBe(0);
  });

  it('no entry lists itself as a synonym', () => {
    const selfRefs = db
      .prepare('SELECT COUNT(*) c FROM synonyms WHERE lemma_id = syn_lemma_id')
      .get() as { c: number };
    expect(selfRefs.c).toBe(0);
  });

  it('no duplicate links and sort_order is contiguous per headword', () => {
    const dupes = db
      .prepare(
        `SELECT COUNT(*) c FROM (
           SELECT lemma_id, syn_lemma_id FROM synonyms
           GROUP BY lemma_id, syn_lemma_id HAVING COUNT(*) > 1)`
      )
      .get() as { c: number };
    expect(dupes.c).toBe(0);
    const gaps = db
      .prepare(
        `SELECT COUNT(*) c FROM (
           SELECT lemma_id, COUNT(*) n, MAX(sort_order) m FROM synonyms
           GROUP BY lemma_id HAVING n != m)`
      )
      .get() as { c: number };
    expect(gaps.c).toBe(0);
  });

  it('every synonym target has a first sense to show as gloss', () => {
    const missing = db
      .prepare(
        `SELECT COUNT(*) c FROM synonyms s
         LEFT JOIN senses se ON se.lemma_id = s.syn_lemma_id AND se.sense_order = 1
         WHERE se.id IS NULL`
      )
      .get() as { c: number };
    expect(missing.c).toBe(0);
  });

  it('a B2 word offers register alternatives: diskutieren → erörtern', () => {
    const syns = synonymsFor('diskutieren').map((s) => s.syn);
    expect(syns).toEqual(expect.arrayContaining(['erörtern', 'debattieren']));
  });

  it('ships a substantial seed set covering every CEFR level', () => {
    const total = (db.prepare('SELECT COUNT(*) c FROM synonyms').get() as { c: number }).c;
    expect(total).toBeGreaterThan(500);
    const levels = db
      .prepare(
        `SELECT DISTINCT l.level FROM synonyms s JOIN lemmas l ON l.id = s.lemma_id ORDER BY l.level`
      )
      .all() as { level: string }[];
    expect(levels.map((r) => r.level)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1']);
  });
});
