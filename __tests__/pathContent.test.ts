import Database from 'better-sqlite3';
import * as path from 'node:path';

/** Lernpfad curriculum checks against the real built DB. */
const db = new Database(path.join(__dirname, '../assets/db/dictionary.db'), { readonly: true });

interface Unit {
  id: number;
  slug: string;
  title: string;
  emoji: string;
  level: string;
  sort_order: number;
}

interface Lesson {
  id: number;
  unit_id: number;
  slug: string;
  title: string;
  kind: 'lesson' | 'review';
  sort_order: number;
}

const units = db
  .prepare('SELECT id, slug, title, emoji, level, sort_order FROM path_units ORDER BY sort_order')
  .all() as Unit[];
const lessons = db
  .prepare('SELECT id, unit_id, slug, title, kind, sort_order FROM path_lessons ORDER BY unit_id, sort_order')
  .all() as Lesson[];

const lessonsOf = (unitId: number) => lessons.filter((l) => l.unit_id === unitId);

describe('path structure', () => {
  it('has a substantial curriculum', () => {
    expect(units.length).toBeGreaterThanOrEqual(20);
    expect(lessons.length).toBeGreaterThanOrEqual(80);
  });

  it('units run in CEFR order', () => {
    const rank = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 } as Record<string, number>;
    const ranks = units.map((u) => rank[u.level]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('every unit has 3-6 nodes and ends with a review node', () => {
    for (const u of units) {
      const ls = lessonsOf(u.id);
      expect({ unit: u.slug, ok: ls.length >= 3 && ls.length <= 6 }).toEqual({ unit: u.slug, ok: true });
      expect({ unit: u.slug, last: ls[ls.length - 1].kind }).toEqual({ unit: u.slug, last: 'review' });
    }
  });

  it('review nodes carry no words or grammar', () => {
    const rows = db
      .prepare(
        `SELECT pl.slug FROM path_lessons pl
         WHERE pl.kind = 'review'
           AND (EXISTS (SELECT 1 FROM path_lesson_words w WHERE w.lesson_id = pl.id)
             OR EXISTS (SELECT 1 FROM path_lesson_topics t WHERE t.lesson_id = pl.id))`
      )
      .all();
    expect(rows).toEqual([]);
  });

  it('lesson nodes teach 4-10 words each', () => {
    for (const l of lessons.filter((l) => l.kind === 'lesson')) {
      const { c } = db
        .prepare('SELECT COUNT(*) AS c FROM path_lesson_words WHERE lesson_id = ?')
        .get(l.id) as { c: number };
      expect({ lesson: l.slug, ok: c >= 4 && c <= 10 }).toEqual({ lesson: l.slug, ok: true });
    }
  });
});

describe('path references', () => {
  it('every path word resolves to a lemma and is taught exactly once', () => {
    const dupes = db
      .prepare(
        `SELECT lemma_id, COUNT(*) AS n FROM path_lesson_words GROUP BY lemma_id HAVING n > 1`
      )
      .all();
    expect(dupes).toEqual([]);
    const orphans = db
      .prepare(
        `SELECT w.lemma_id FROM path_lesson_words w
         LEFT JOIN lemmas l ON l.id = w.lemma_id WHERE l.id IS NULL`
      )
      .all();
    expect(orphans).toEqual([]);
  });

  it('every A1-B1 grammar topic is covered exactly once on the path', () => {
    const coverage = db
      .prepare(
        `SELECT t.slug, COUNT(pt.lesson_id) AS n
         FROM grammar_topics t
         LEFT JOIN path_lesson_topics pt ON pt.topic_id = t.id
         GROUP BY t.id`
      )
      .all() as { slug: string; n: number }[];
    for (const c of coverage) {
      expect({ topic: c.slug, covered: c.n }).toEqual({ topic: c.slug, covered: 1 });
    }
  });

  it('words teach at the unit level or below (no B2 words in an A1 unit)', () => {
    const rank = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 } as Record<string, number>;
    const rows = db
      .prepare(
        `SELECT pu.slug AS unit, pu.level AS unit_level, l.level AS word_level, l.lemma
         FROM path_lesson_words w
         JOIN path_lessons pl ON pl.id = w.lesson_id
         JOIN path_units pu ON pu.id = pl.unit_id
         JOIN lemmas l ON l.id = w.lemma_id`
      )
      .all() as { unit: string; unit_level: string; word_level: string; lemma: string }[];
    for (const r of rows) {
      expect({
        unit: r.unit,
        lemma: r.lemma,
        ok: rank[r.word_level] <= rank[r.unit_level],
      }).toEqual({ unit: r.unit, lemma: r.lemma, ok: true });
    }
  });

  it('the curated A1 curriculum covers a large share of the A1 vocabulary', () => {
    const { taught } = db
      .prepare(
        `SELECT COUNT(*) AS taught FROM path_lesson_words w
         JOIN lemmas l ON l.id = w.lemma_id WHERE l.level = 'A1'`
      )
      .get() as { taught: number };
    expect(taught).toBeGreaterThanOrEqual(600);
  });

  it('unit and lesson slugs are unique and kebab-case', () => {
    const slugs = [...units.map((u) => u.slug), ...lessons.map((l) => l.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });
});
