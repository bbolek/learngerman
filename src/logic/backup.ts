/**
 * User-data backup & restore: everything the user owns (saved words, SRS
 * state, XP ledger, streak, quests, achievements, reading/path progress,
 * settings) serialized into one portable JSON document the user stores OUTSIDE the app sandbox (Files /
 * iCloud Drive / Google Drive / Downloads) — the app's own storage is wiped
 * on uninstall, an exported file is not.
 *
 * Content row ids are not stable across app versions, so — exactly like the
 * in-place content update (src/logic/contentUpdate.ts) — rows referencing
 * content are stored under natural keys and resolved against whatever content
 * the restoring install ships:
 *   - saved words / SRS state / review log → lemma + pos
 *   - quiz attempts → topic slug + qtype + question prompt
 * Rows whose content no longer exists are dropped, never invented.
 *
 * Restore REPLACES the whole user state in one transaction: a half-applied
 * restore can never survive, and the previous state returns on rollback.
 */

import { QUESTION_KEY } from '@/logic/contentUpdate';

/** Minimal surface shared by expo-sqlite and the better-sqlite3 test shim. */
export interface BackupDb {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  runAsync(sql: string, params: (string | number | null)[]): Promise<unknown>;
}

type Row = Record<string, string | number | null>;

export const BACKUP_FORMAT = 1;

export interface BackupDoc {
  app: 'deutschly';
  format: number;
  exported_at: string;
  schema_version: number;
  tables: Record<string, Row[]>;
}

export interface RestoreSummary {
  /** Rows written into the database. */
  restored: number;
  /** Rows skipped because their lemma/question no longer exists. */
  dropped: number;
}

/** User tables whose rows carry a lemma_id (replaced by lemma+pos on export). */
const LEMMA_TABLES = ['user_saved_words', 'srs_state', 'review_log'] as const;

/** User tables copied verbatim — natural keys or no content references at all. */
const PLAIN_TABLES = [
  'grammar_srs',
  'reading_progress',
  'path_progress',
  'daily_activity',
  'game_results',
  'xp_events',
  'quest_claims',
  'achievements_unlocked',
  'streak_freeze_days',
] as const;

/** Every user-owned table, in an order where parents precede children. */
const ALL_USER_TABLES = [
  'user_saved_words',
  'srs_state',
  'review_log',
  'quiz_attempts',
  ...PLAIN_TABLES,
] as const;

/**
 * Serialize the whole user state. `exportedAt` is injected (pure logic — no
 * clocks in src/logic/).
 */
export async function createBackup(db: BackupDb, exportedAt: string): Promise<BackupDoc> {
  const tables: Record<string, Row[]> = {};

  for (const table of LEMMA_TABLES) {
    const rows = await db.getAllAsync<Row>(
      `SELECT u.*, l.lemma AS lemma, l.pos AS pos
       FROM ${table} u JOIN lemmas l ON l.id = u.lemma_id`
    );
    tables[table] = rows.map(({ lemma_id: _drop, ...rest }) => rest);
  }

  tables.quiz_attempts = (
    await db.getAllAsync<Row>(
      `SELECT a.*, k.k AS question_key
       FROM quiz_attempts a JOIN (${QUESTION_KEY('main')}) k ON k.id = a.question_id`
    )
  ).map(({ question_id: _drop, ...rest }) => rest);

  for (const table of PLAIN_TABLES) {
    tables[table] = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
  }
  tables.user_meta = await db.getAllAsync<Row>(
    "SELECT key, value FROM user_meta WHERE key != 'schema_version'"
  );

  const version = await db.getAllAsync<{ value: string }>(
    "SELECT value FROM user_meta WHERE key = 'schema_version'"
  );
  return {
    app: 'deutschly',
    format: BACKUP_FORMAT,
    exported_at: exportedAt,
    schema_version: Number(version[0]?.value ?? 0),
    tables,
  };
}

async function tableColumns(db: BackupDb, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => r.name));
}

/**
 * Insert rows using only the columns the live table actually has, so backups
 * survive user-schema drift in both directions: columns added since the
 * backup fall back to their defaults, removed ones are ignored.
 */
async function insertRows(db: BackupDb, table: string, rows: Row[], live: Set<string>): Promise<number> {
  let written = 0;
  for (const row of rows) {
    const cols = Object.keys(row).filter((c) => live.has(c));
    if (cols.length === 0) continue;
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => row[c] ?? null)
    );
    written++;
  }
  return written;
}

/**
 * Replace the entire user state with the backup's. Content stays untouched;
 * `schema_version` stays the installed one (migrations have already shaped
 * the tables the rows are going into).
 */
export async function restoreBackup(db: BackupDb, doc: BackupDoc): Promise<RestoreSummary> {
  if (!doc || doc.app !== 'deutschly' || !doc.tables || typeof doc.format !== 'number') {
    throw new Error('not a Deutschly backup file');
  }
  if (doc.format > BACKUP_FORMAT) {
    throw new Error('backup was created by a newer app version');
  }

  // ---- natural key → current content id (built before touching anything) ----
  const lemmaIds = new Map<string, number>();
  for (const r of await db.getAllAsync<{ id: number; lemma: string; pos: string }>(
    'SELECT id, lemma, pos FROM lemmas'
  )) {
    lemmaIds.set(`${r.lemma}|${r.pos}`, r.id);
  }
  const questionIds = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const r of await db.getAllAsync<{ id: number; k: string }>(QUESTION_KEY('main'))) {
    if (questionIds.has(r.k)) ambiguous.add(r.k);
    else questionIds.set(r.k, r.id);
  }
  for (const k of ambiguous) questionIds.delete(k);

  const summary: RestoreSummary = { restored: 0, dropped: 0 };
  const rowsOf = (table: string): Row[] => {
    const rows = doc.tables[table];
    return Array.isArray(rows) ? rows : [];
  };

  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await db.execAsync('BEGIN');

    for (const table of ALL_USER_TABLES) await db.execAsync(`DELETE FROM ${table}`);
    await db.execAsync("DELETE FROM user_meta WHERE key != 'schema_version'");

    for (const table of LEMMA_TABLES) {
      const live = await tableColumns(db, table);
      const resolved: Row[] = [];
      for (const { lemma, pos, ...rest } of rowsOf(table)) {
        const id = lemmaIds.get(`${lemma}|${pos}`);
        if (id === undefined) summary.dropped++;
        else resolved.push({ ...rest, lemma_id: id });
      }
      summary.restored += await insertRows(db, table, resolved, live);
    }

    {
      const live = await tableColumns(db, 'quiz_attempts');
      const resolved: Row[] = [];
      for (const { question_key, ...rest } of rowsOf('quiz_attempts')) {
        const id = questionIds.get(String(question_key));
        if (id === undefined) summary.dropped++;
        else resolved.push({ ...rest, question_id: id });
      }
      summary.restored += await insertRows(db, 'quiz_attempts', resolved, live);
    }

    for (const table of PLAIN_TABLES) {
      summary.restored += await insertRows(db, table, rowsOf(table), await tableColumns(db, table));
    }
    summary.restored += await insertRows(
      db,
      'user_meta',
      rowsOf('user_meta').filter((r) => r.key !== 'schema_version'),
      new Set(['key', 'value'])
    );

    await db.execAsync('COMMIT');
  } catch (err) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON').catch(() => {});
  }
  return summary;
}
