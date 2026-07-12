import { type SQLiteDatabase } from 'expo-sqlite';

/**
 * User-data migrations, applied to the imported dictionary DB on every
 * launch. Content tables (lemmas/forms/senses/grammar_*) are read-only and
 * owned by scripts/build-dictionary.ts.
 */
export const MIGRATIONS: string[] = [
  // v1 — initial user tables
  `
  CREATE TABLE IF NOT EXISTS user_saved_words (
    lemma_id INTEGER PRIMARY KEY REFERENCES lemmas(id),
    saved_at TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS srs_state (
    lemma_id INTEGER PRIMARY KEY REFERENCES user_saved_words(lemma_id) ON DELETE CASCADE,
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    due_at TEXT NOT NULL,
    last_reviewed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_state(due_at);

  CREATE TABLE IF NOT EXISTS review_log (
    id INTEGER PRIMARY KEY,
    lemma_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL,
    interval_before REAL,
    interval_after REAL
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES grammar_questions(id),
    correct INTEGER NOT NULL,
    answer_given TEXT,
    attempted_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_qa_q ON quiz_attempts(question_id);

  CREATE TABLE IF NOT EXISTS daily_activity (
    day TEXT PRIMARY KEY,
    reviews_done INTEGER NOT NULL DEFAULT 0,
    quiz_done INTEGER NOT NULL DEFAULT 0,
    words_saved INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // v2 — legacy "learned" flag (feature removed; column kept for existing installs)
  `
  ALTER TABLE user_saved_words ADD COLUMN learned_at TEXT;
  `,
  // v3 — arcade games: per-round results (no content FKs — survives content swaps)
  // and a daily_activity column so games count toward the streak
  `
  CREATE TABLE IF NOT EXISTS game_results (
    id INTEGER PRIMARY KEY,
    game_key TEXT NOT NULL,
    score INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    total INTEGER NOT NULL,
    best_streak INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    played_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_results_key ON game_results(game_key, score DESC);

  ALTER TABLE daily_activity ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0;
  `,
  // v4 — where a saved card came from, so words auto-enrolled from a game/duel
  // miss ('mistake') can be told apart from ones the user saved ('manual').
  // A plain column (not a new table) rides through content swaps untouched:
  // applyContentUpdate only rewrites lemma_id in place, never other columns.
  `
  ALTER TABLE user_saved_words ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
  `,
  // v5 — spaced repetition for grammar topics. Keyed by the topic SLUG, a
  // stable natural key, so no content-swap remap is needed (topic ids are not
  // stable across builds; slugs are). One SM-2 card per topic, rescheduled
  // from each completed quiz round's accuracy.
  `
  CREATE TABLE IF NOT EXISTS grammar_srs (
    slug TEXT PRIMARY KEY,
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    due_at TEXT NOT NULL,
    last_reviewed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_grammar_srs_due ON grammar_srs(due_at);
  `,
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON');
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS user_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
  );
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM user_meta WHERE key = 'schema_version'"
  );
  const current = row ? Number(row.value) : 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.execAsync(MIGRATIONS[v]);
    await db.runAsync(
      "INSERT OR REPLACE INTO user_meta (key, value) VALUES ('schema_version', ?)",
      [String(v + 1)]
    );
  }
}
