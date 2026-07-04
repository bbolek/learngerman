import Database from 'better-sqlite3';
import * as path from 'node:path';

/** Form-example content checks against the real built DB. */
const db = new Database(path.join(__dirname, '../assets/db/dictionary.db'), { readonly: true });

function examplesFor(lemma: string): { tag: string; de: string; en: string }[] {
  return db
    .prepare(
      `SELECT e.tag, e.de, e.en FROM examples e
       JOIN lemmas l ON l.id = e.lemma_id WHERE l.lemma = ? ORDER BY e.sort_order`
    )
    .all(lemma) as { tag: string; de: string; en: string }[];
}

describe('form examples content', () => {
  it('machen has examples across tenses', () => {
    const tags = examplesFor('machen').map((e) => e.tag);
    expect(tags).toEqual(expect.arrayContaining(['präsens', 'präteritum', 'perfekt']));
  });

  it('tense examples actually use the tagged form of machen', () => {
    const byTag = new Map(examplesFor('machen').map((e) => [e.tag, e.de.toLowerCase()]));
    expect(byTag.get('präteritum')).toMatch(/macht(e|est|en|et)/);
    expect(byTag.get('perfekt')).toContain('gemacht');
  });

  it('a strong verb (gehen) has a correct perfekt example with sein', () => {
    const byTag = new Map(examplesFor('gehen').map((e) => [e.tag, e.de.toLowerCase()]));
    expect(byTag.get('perfekt')).toContain('gegangen');
  });

  it('gut has komparativ and superlativ examples', () => {
    const tags = examplesFor('gut').map((e) => e.tag);
    expect(tags).toEqual(expect.arrayContaining(['komparativ', 'superlativ']));
  });

  it('Haus has a plural example using Häuser', () => {
    const plural = examplesFor('Haus').find((e) => e.tag === 'plural');
    expect(plural?.de).toContain('Häuser');
  });

  it('every example row has both languages and a known tag', () => {
    const rows = db
      .prepare('SELECT tag, de, en FROM examples')
      .all() as { tag: string; de: string; en: string }[];
    expect(rows.length).toBeGreaterThan(500);
    const allowed = new Set([
      'präsens', 'präteritum', 'perfekt', 'imperativ', 'frage', 'negation',
      'plural', 'dativ', 'akkusativ', 'komparativ', 'superlativ', 'allgemein',
    ]);
    for (const r of rows) {
      expect(allowed.has(r.tag)).toBe(true);
      expect(r.de.length).toBeGreaterThan(0);
      expect(r.en.length).toBeGreaterThan(0);
    }
  });
});
