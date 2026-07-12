import Database from 'better-sqlite3';
import * as path from 'node:path';

import { THEMES } from '@/data/themes.generated';

/** Themed word lists must stay in sync with the built dictionary. */
const db = new Database(path.join(__dirname, '../assets/db/dictionary.db'), { readonly: true });
const resolves = db.prepare('SELECT 1 FROM lemmas WHERE lemma = ? AND pos = ?');

describe('generated themes', () => {
  it('has unique, non-empty slugs and titles', () => {
    const slugs = new Set<string>();
    for (const t of THEMES) {
      expect(t.slug).toMatch(/^[a-z]+$/);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(slugs.has(t.slug)).toBe(false);
      slugs.add(t.slug);
    }
    expect(THEMES.length).toBeGreaterThanOrEqual(10);
  });

  it('every theme has a healthy number of words with no duplicates', () => {
    for (const t of THEMES) {
      expect(t.words.length).toBeGreaterThanOrEqual(20);
      const keys = new Set(t.words.map((w) => `${w.lemma}|${w.pos}`));
      expect(keys.size).toBe(t.words.length);
    }
  });

  it('every word carries a valid CEFR level', () => {
    const cefr = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
    for (const t of THEMES) {
      for (const w of t.words) expect(cefr.has(w.level)).toBe(true);
    }
  });

  it('every themed word resolves to a real dictionary lemma', () => {
    for (const t of THEMES) {
      for (const w of t.words) {
        expect({ theme: t.slug, word: `${w.lemma}|${w.pos}`, found: resolves.get(w.lemma, w.pos) != null }).toEqual(
          { theme: t.slug, word: `${w.lemma}|${w.pos}`, found: true }
        );
      }
    }
  });

  it('a word belongs to at most one theme', () => {
    const owner = new Map<string, string>();
    for (const t of THEMES) {
      for (const w of t.words) {
        const key = `${w.lemma}|${w.pos}`;
        expect(owner.has(key)).toBe(false);
        owner.set(key, t.slug);
      }
    }
  });
});
