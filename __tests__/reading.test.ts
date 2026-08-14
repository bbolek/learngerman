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
    source: string | null;
    illustration_svg: string | null;
    word_count: number;
    sort_order: number;
  }

  const texts = db.prepare('SELECT * FROM reading_texts ORDER BY sort_order').all() as TextRow[];

  /** Reading grows with the learner: every CEFR level carries its own shelf. */
  const RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 } as Record<string, number>;

  it('ships at least three texts on every level A1–C2', () => {
    for (const level of Object.keys(RANK)) {
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
      // one sitting per text: the C-level stories run long, but not endless
      expect(words).toBeGreaterThanOrEqual(40);
      expect(words).toBeLessThanOrEqual(700);
    }
  });

  it('gets longer as the level rises', () => {
    const shortest = (level: string) =>
      Math.min(...texts.filter((t) => t.level === level).map((t) => t.word_count));
    expect(shortest('B2')).toBeGreaterThan(shortest('A1'));
    expect(shortest('C2')).toBeGreaterThan(shortest('B1'));
  });

  it('illustrations are inline SVG documents', () => {
    const svgs = [
      ...texts.map((t) => t.illustration_svg),
      ...(
        db.prepare('SELECT illustration_svg FROM reading_paragraphs').all() as {
          illustration_svg: string | null;
        }[]
      ).map((p) => p.illustration_svg),
    ].filter((svg): svg is string => svg != null);
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg).toMatch(/<svg[\s>]/);
  });

  it('credits the source of every retold text', () => {
    // Retellings of public-domain material must name where they come from.
    for (const t of texts) {
      if (t.source != null) expect(t.source).toMatch(/gemeinfrei/);
    }
    expect(texts.filter((t) => t.source != null).length).toBeGreaterThanOrEqual(10);
  });

  it('lists easiest level first', () => {
    const order = texts.map((t) => RANK[t.level]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('slugs are unique', () => {
    expect(new Set(texts.map((t) => t.slug)).size).toBe(texts.length);
  });
});
