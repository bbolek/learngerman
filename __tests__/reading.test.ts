import Database from 'better-sqlite3';
import * as path from 'node:path';

// ---- content assumptions the Leseecke relies on (real built DB) ----

describe('reading texts content', () => {
  const db = new Database(path.join(__dirname, '../assets/db/dictionary.db'), { readonly: true });

  interface TextRow {
    id: number;
    slug: string;
    title: string;
    level: string;
    teaser: string;
    word_count: number;
    sort_order: number;
  }

  const texts = db.prepare('SELECT * FROM reading_texts ORDER BY sort_order').all() as TextRow[];

  it('ships at least nine texts across A1–B1', () => {
    expect(texts.length).toBeGreaterThanOrEqual(9);
    for (const level of ['A1', 'A2', 'B1']) {
      expect(texts.filter((t) => t.level === level).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every text is complete and its word count matches the paragraphs', () => {
    const paras = db
      .prepare('SELECT text_id, de, en FROM reading_paragraphs ORDER BY text_id, sort_order')
      .all() as { text_id: number; de: string; en: string }[];
    for (const t of texts) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.teaser.length).toBeGreaterThan(0);
      const own = paras.filter((p) => p.text_id === t.id);
      expect(own.length).toBeGreaterThanOrEqual(3);
      for (const p of own) {
        expect(p.de.length).toBeGreaterThan(0);
        expect(p.en.length).toBeGreaterThan(0);
      }
      const words = own.reduce((sum, p) => sum + p.de.trim().split(/\s+/).length, 0);
      expect(t.word_count).toBe(words);
      // short graded texts, not essays
      expect(words).toBeGreaterThanOrEqual(40);
      expect(words).toBeLessThanOrEqual(250);
    }
  });

  it('lists easiest level first', () => {
    const rank = { A1: 1, A2: 2, B1: 3 } as Record<string, number>;
    const order = texts.map((t) => rank[t.level]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('slugs are unique', () => {
    expect(new Set(texts.map((t) => t.slug)).size).toBe(texts.length);
  });
});
