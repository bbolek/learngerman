import { getDb } from '@/db/client';

/**
 * Lernpfad data access. Content rows (path_units/path_lessons/…) are built by
 * scripts/build-dictionary.ts and swapped wholesale on content updates — all
 * user progress is keyed by lesson SLUG so it rides through untouched.
 */

export interface PathNode {
  slug: string;
  title: string;
  kind: 'lesson' | 'review';
  /** Global 0-based position along the whole path. */
  order: number;
  wordCount: number;
  /** 0 = not completed yet, else best run 1–3. */
  stars: number;
}

export interface PathUnit {
  slug: string;
  title: string;
  emoji: string;
  level: string;
  nodes: PathNode[];
}

/** The whole path with per-node best stars — two queries, assembled here. */
export async function listPath(): Promise<PathUnit[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    unit_slug: string;
    unit_title: string;
    emoji: string;
    level: string;
    slug: string;
    title: string;
    kind: 'lesson' | 'review';
    word_count: number;
  }>(
    `SELECT pu.slug AS unit_slug, pu.title AS unit_title, pu.emoji, pu.level,
            pl.slug, pl.title, pl.kind,
            (SELECT COUNT(*) FROM path_lesson_words w WHERE w.lesson_id = pl.id) AS word_count
     FROM path_lessons pl
     JOIN path_units pu ON pu.id = pl.unit_id
     ORDER BY pu.sort_order, pl.sort_order`
  );
  const starRows = await db.getAllAsync<{ lesson_slug: string; stars: number }>(
    'SELECT lesson_slug, stars FROM path_progress'
  );
  const stars = new Map(starRows.map((r) => [r.lesson_slug, r.stars]));

  const units: PathUnit[] = [];
  let order = 0;
  for (const r of rows) {
    let unit = units[units.length - 1];
    if (!unit || unit.slug !== r.unit_slug) {
      unit = { slug: r.unit_slug, title: r.unit_title, emoji: r.emoji, level: r.level, nodes: [] };
      units.push(unit);
    }
    unit.nodes.push({
      slug: r.slug,
      title: r.title,
      kind: r.kind,
      order: order++,
      wordCount: r.word_count,
      stars: stars.get(r.slug) ?? 0,
    });
  }
  return units;
}

export interface LessonWord {
  lemma_id: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  level: string;
  gloss: string;
  example_de: string | null;
  example_en: string | null;
}

export interface LessonQuestion {
  id: number;
  qtype: 'mc' | 'fill' | 'order' | 'case_id';
  payload: string;
  difficulty: number;
  topic_slug: string;
  topic_title: string;
}

export interface LessonContent {
  slug: string;
  title: string;
  kind: 'lesson' | 'review';
  unitSlug: string;
  unitTitle: string;
  unitEmoji: string;
  level: string;
  words: LessonWord[];
  questions: LessonQuestion[];
  /** Same-level words for MC distractors (lesson words excluded). */
  distractors: { lemma_id: number; lemma: string; pos: string; gloss: string }[];
}

const WORD_SELECT = `
  l.id AS lemma_id, l.lemma, l.pos, l.gender, l.plural, l.level,
  (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss,
  (SELECT example_de FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS example_de,
  (SELECT example_en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS example_en`;

/** Everything the lesson player needs for a `kind:'lesson'` node. */
export async function getLessonContent(slug: string): Promise<LessonContent | null> {
  const db = getDb();
  const node = await db.getFirstAsync<{
    id: number;
    slug: string;
    title: string;
    kind: 'lesson' | 'review';
    unit_slug: string;
    unit_title: string;
    emoji: string;
    level: string;
  }>(
    `SELECT pl.id, pl.slug, pl.title, pl.kind, pu.slug AS unit_slug,
            pu.title AS unit_title, pu.emoji, pu.level
     FROM path_lessons pl JOIN path_units pu ON pu.id = pl.unit_id
     WHERE pl.slug = ?`,
    [slug]
  );
  if (!node) return null;

  const words = await db.getAllAsync<LessonWord>(
    `SELECT ${WORD_SELECT}
     FROM path_lesson_words w JOIN lemmas l ON l.id = w.lemma_id
     WHERE w.lesson_id = ? ORDER BY w.sort_order`,
    [node.id]
  );

  // Easiest questions first (random tie-break) — a path lesson introduces a
  // topic, the quiz screen stays the place to grind the hard ones.
  const topicRefs = await db.getAllAsync<{ topic_id: number; question_count: number }>(
    'SELECT topic_id, question_count FROM path_lesson_topics WHERE lesson_id = ?',
    [node.id]
  );
  const questions: LessonQuestion[] = [];
  for (const ref of topicRefs) {
    questions.push(
      ...(await db.getAllAsync<LessonQuestion>(
        `SELECT q.id, q.qtype, q.payload, q.difficulty, t.slug AS topic_slug, t.title AS topic_title
         FROM grammar_questions q JOIN grammar_topics t ON t.id = q.topic_id
         WHERE q.topic_id = ?
         ORDER BY q.difficulty, RANDOM() LIMIT ?`,
        [ref.topic_id, ref.question_count]
      ))
    );
  }

  const distractors = await db.getAllAsync<{
    lemma_id: number;
    lemma: string;
    pos: string;
    gloss: string;
  }>(
    `SELECT l.id AS lemma_id, l.lemma, l.pos,
            (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss
     FROM lemmas l
     WHERE l.level = ?
       AND l.id NOT IN (SELECT lemma_id FROM path_lesson_words WHERE lesson_id = ?)
     ORDER BY RANDOM() LIMIT 40`,
    [node.level, node.id]
  );

  return {
    slug: node.slug,
    title: node.title,
    kind: node.kind,
    unitSlug: node.unit_slug,
    unitTitle: node.unit_title,
    unitEmoji: node.emoji,
    level: node.level,
    words,
    questions,
    distractors,
  };
}

export interface ReviewPoolCard extends LessonWord {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due: boolean;
}

export interface ReviewPool {
  vocab: ReviewPoolCard[];
  questions: LessonQuestion[];
  /** Topic slugs the review touches, for SRS settlement on completion. */
  dueTopics: { slug: string; title: string }[];
}

/**
 * Material for a `kind:'review'` node: path-enrolled vocab from all lessons
 * strictly before this node (due cards flagged), plus questions from covered
 * grammar topics whose SRS card is due.
 */
export async function getReviewPool(reviewSlug: string, now: Date): Promise<ReviewPool> {
  const db = getDb();
  const endOfDay = now.toISOString().slice(0, 10) + 'T23:59:59.999Z';
  const before = `
    WITH me AS (
      SELECT pl.sort_order AS lsort, pu.sort_order AS usort
      FROM path_lessons pl JOIN path_units pu ON pu.id = pl.unit_id
      WHERE pl.slug = ?
    )
    SELECT pl.id FROM path_lessons pl
    JOIN path_units pu ON pu.id = pl.unit_id, me
    WHERE pu.sort_order < me.usort
       OR (pu.sort_order = me.usort AND pl.sort_order < me.lsort)`;

  const vocab = await db.getAllAsync<ReviewPoolCard>(
    `SELECT ${WORD_SELECT},
            s.ease, s.interval_days, s.reps, s.lapses,
            (s.due_at <= ?) AS due
     FROM path_lesson_words w
     JOIN lemmas l ON l.id = w.lemma_id
     JOIN srs_state s ON s.lemma_id = w.lemma_id
     WHERE w.lesson_id IN (${before})
     ORDER BY due DESC, s.due_at`,
    [endOfDay, reviewSlug]
  );

  const dueTopics = await db.getAllAsync<{ slug: string; title: string }>(
    `SELECT t.slug, t.title
     FROM path_lesson_topics pt
     JOIN grammar_topics t ON t.id = pt.topic_id
     JOIN grammar_srs g ON g.slug = t.slug
     WHERE pt.lesson_id IN (${before}) AND g.due_at <= ?`,
    [reviewSlug, endOfDay]
  );

  const questions: LessonQuestion[] = [];
  for (const t of dueTopics) {
    questions.push(
      ...(await db.getAllAsync<LessonQuestion>(
        `SELECT q.id, q.qtype, q.payload, q.difficulty, t.slug AS topic_slug, t.title AS topic_title
         FROM grammar_questions q JOIN grammar_topics t ON t.id = q.topic_id
         WHERE t.slug = ?
         ORDER BY RANDOM() LIMIT 3`,
        [t.slug]
      ))
    );
  }

  return { vocab, questions, dueTopics };
}

/**
 * Enroll a lesson's words into the shared vocab SRS (due immediately) —
 * `source='path'` marks provenance. Unlike saveWord() this does NOT bump
 * daily_activity.words_saved: completing a lesson shouldn't farm the
 * "save N words" quest.
 */
export async function enrollPathWords(lemmaIds: number[], now: Date): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const id of lemmaIds) {
      await db.runAsync(
        `INSERT OR IGNORE INTO user_saved_words (lemma_id, saved_at, source) VALUES (?, ?, 'path')`,
        [id, now.toISOString()]
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO srs_state (lemma_id, ease, interval_days, reps, lapses, due_at)
         VALUES (?, 2.5, 0, 0, 0, ?)`,
        [id, now.toISOString()]
      );
    }
  });
}

/** Upsert a completed lesson (best stars win). Returns whether it was the first run. */
export async function completeLesson(
  slug: string,
  stars: number,
  accuracy: number,
  now: Date
): Promise<{ firstTime: boolean }> {
  const db = getDb();
  const existing = await db.getFirstAsync<{ stars: number }>(
    'SELECT stars FROM path_progress WHERE lesson_slug = ?',
    [slug]
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO path_progress (lesson_slug, stars, first_completed_at, last_completed_at, last_accuracy)
         VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(lesson_slug) DO UPDATE SET
         stars = MAX(stars, excluded.stars),
         last_completed_at = excluded.last_completed_at,
         last_accuracy = excluded.last_accuracy`,
      [slug, stars, now.toISOString(), now.toISOString(), accuracy]
    );
    const day = now.toISOString().slice(0, 10);
    await db.runAsync(
      `INSERT INTO daily_activity (day, path_lessons_done) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET path_lessons_done = path_lessons_done + 1`,
      [day]
    );
  });
  return { firstTime: existing == null };
}

export type PathPlacement =
  | { skipped: true }
  | { boundaryUnitSlug: string | null; placedLevel: string; takenAt: string };

const PLACEMENT_KEY = 'path_placement';

export async function getPlacement(): Promise<PathPlacement | null> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM user_meta WHERE key = ?',
    [PLACEMENT_KEY]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as PathPlacement;
  } catch {
    return null;
  }
}

export async function setPlacement(placement: PathPlacement): Promise<void> {
  await getDb().runAsync('INSERT OR REPLACE INTO user_meta (key, value) VALUES (?, ?)', [
    PLACEMENT_KEY,
    JSON.stringify(placement),
  ]);
}

/** Progress counters for achievements and the Home card. */
export async function pathCounts(): Promise<{ lessonsDone: number; unitsDone: number }> {
  const db = getDb();
  // Join against content so orphaned progress rows (from a curriculum
  // reshuffle) never inflate the counters.
  const lessons = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM path_progress p
     JOIN path_lessons pl ON pl.slug = p.lesson_slug`
  );
  const units = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM path_units pu
     WHERE NOT EXISTS (
       SELECT 1 FROM path_lessons pl
       LEFT JOIN path_progress p ON p.lesson_slug = pl.slug
       WHERE pl.unit_id = pu.id AND p.lesson_slug IS NULL
     )`
  );
  return { lessonsDone: lessons?.c ?? 0, unitsDone: units?.c ?? 0 };
}
