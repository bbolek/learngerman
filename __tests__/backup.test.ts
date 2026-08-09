import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { MIGRATIONS } from '@/db/migrations';
import { BACKUP_FORMAT, createBackup, restoreBackup, type BackupDb, type BackupDoc } from '@/logic/backup';

const BUILT = path.join(__dirname, '../assets/db/dictionary.db');

function adapt(db: Database.Database): BackupDb {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async getAllAsync<T>(sql: string) {
      return db.prepare(sql).all() as T[];
    },
    async runAsync(sql, params) {
      db.prepare(sql).run(...params);
    },
  };
}

/** A fresh install: the built DB plus all user-schema migrations, no user data. */
function freshInstall(dir: string, name: string): Database.Database {
  const p = path.join(dir, name);
  fs.copyFileSync(BUILT, p);
  const db = new Database(p);
  db.pragma('foreign_keys = ON');
  db.exec("CREATE TABLE IF NOT EXISTS user_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  for (const m of MIGRATIONS) db.exec(m);
  db.prepare("INSERT OR REPLACE INTO user_meta (key, value) VALUES ('schema_version', ?)").run(
    String(MIGRATIONS.length)
  );
  return db;
}

function seedUserData(db: Database.Database): { lemmaId: number; questionId: number } {
  const lemmaId = (
    db.prepare("SELECT id FROM lemmas WHERE lemma = 'machen' AND pos = 'verb'").get() as { id: number }
  ).id;
  const questionId = (
    db
      .prepare(
        `SELECT q.id FROM grammar_questions q
         WHERE json_extract(q.payload, '$.prompt') = 'Ich sehe ___ Mann.'`
      )
      .get() as { id: number }
  ).id;

  db.prepare(
    "INSERT INTO user_saved_words (lemma_id, saved_at, note, source) VALUES (?, '2026-08-01T10:00:00Z', 'merken!', 'manual')"
  ).run(lemmaId);
  db.prepare(
    `INSERT INTO srs_state (lemma_id, ease, interval_days, reps, lapses, due_at)
     VALUES (?, 2.1, 5, 3, 1, '2026-08-09T10:00:00Z')`
  ).run(lemmaId);
  db.prepare(
    'INSERT INTO review_log (lemma_id, rating, reviewed_at, interval_before, interval_after) VALUES (?, 4, ?, 2, 5)'
  ).run(lemmaId, '2026-08-04T10:00:00Z');
  db.prepare(
    "INSERT INTO quiz_attempts (question_id, correct, answer_given, attempted_at) VALUES (?, 1, 'den', '2026-08-04T11:00:00Z')"
  ).run(questionId);

  db.prepare(
    "INSERT INTO xp_events (kind, amount, day, created_at) VALUES ('review', 40, '2026-08-04', '2026-08-04T10:05:00Z')"
  ).run();
  db.prepare(
    "INSERT INTO xp_events (kind, amount, day, created_at) VALUES ('streak_repair', -60, '2026-08-05', '2026-08-05T09:00:00Z')"
  ).run();
  db.prepare(
    "INSERT INTO quest_claims (day, quest_key, xp, claimed_at) VALUES ('2026-08-04', 'review_10', 30, '2026-08-04T10:06:00Z')"
  ).run();
  db.prepare(
    "INSERT INTO achievements_unlocked (id, unlocked_at) VALUES ('first_word', '2026-08-01T10:00:01Z')"
  ).run();
  db.prepare("INSERT INTO streak_freeze_days (day, used_at) VALUES ('2026-08-03', '2026-08-04T00:10:00Z')").run();
  db.prepare(
    "INSERT INTO daily_activity (day, reviews_done, quiz_done, words_saved, games_played, texts_read, path_lessons_done) VALUES ('2026-08-04', 10, 4, 1, 2, 1, 1)"
  ).run();
  db.prepare(
    "INSERT INTO game_results (game_key, score, correct, total, best_streak, duration_ms, played_at) VALUES ('blitz', 900, 9, 10, 6, 61000, '2026-08-04T18:00:00Z')"
  ).run();
  db.prepare(
    "INSERT INTO grammar_srs (slug, ease, interval_days, reps, lapses, due_at) VALUES ('akkusativ', 2.3, 4, 2, 0, '2026-08-10T00:00:00Z')"
  ).run();
  db.prepare("INSERT INTO reading_progress (slug, completed_at) VALUES ('im-cafe', '2026-08-02T20:00:00Z')").run();
  db.prepare(
    "INSERT INTO path_progress (lesson_slug, stars, first_completed_at, last_completed_at, last_accuracy) VALUES ('a1-hallo-1', 3, '2026-08-01T12:00:00Z', '2026-08-02T12:00:00Z', 0.95)"
  ).run();
  db.prepare("INSERT INTO user_meta (key, value) VALUES ('streak_freezes', '2')").run();
  db.prepare(
    `INSERT INTO user_meta (key, value) VALUES ('settings', '{"themePreference":"dark","dailyNewLimit":20}')`
  ).run();
  return { lemmaId, questionId };
}

describe('backup & restore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips the whole user state onto a fresh install', async () => {
    const oldDb = freshInstall(dir, 'old.db');
    seedUserData(oldDb);
    const doc = await createBackup(adapt(oldDb), '2026-08-09T12:00:00Z');
    oldDb.close();

    expect(doc.app).toBe('deutschly');
    expect(doc.format).toBe(BACKUP_FORMAT);
    expect(doc.schema_version).toBe(MIGRATIONS.length);
    expect(doc.tables.user_saved_words).toEqual([
      expect.objectContaining({ lemma: 'machen', pos: 'verb', note: 'merken!' }),
    ]);
    expect(doc.tables.user_saved_words[0]).not.toHaveProperty('lemma_id');
    expect(String(doc.tables.quiz_attempts[0].question_key)).toContain('Ich sehe ___ Mann.');

    // what actually gets stored/restored is the JSON file, not the object
    const parsed = JSON.parse(JSON.stringify(doc)) as BackupDoc;

    const newDb = freshInstall(dir, 'new.db');
    const summary = await restoreBackup(adapt(newDb), parsed);
    expect(summary.dropped).toBe(0);

    const saved = newDb
      .prepare(
        `SELECT l.lemma, l.pos, u.note, u.source, s.ease, s.reps
         FROM user_saved_words u
         JOIN lemmas l ON l.id = u.lemma_id
         JOIN srs_state s ON s.lemma_id = u.lemma_id`
      )
      .all();
    expect(saved).toEqual([
      { lemma: 'machen', pos: 'verb', note: 'merken!', source: 'manual', ease: 2.1, reps: 3 },
    ]);

    const attempt = newDb
      .prepare(
        `SELECT json_extract(q.payload, '$.prompt') AS prompt, a.correct, a.answer_given
         FROM quiz_attempts a JOIN grammar_questions q ON q.id = a.question_id`
      )
      .get();
    expect(attempt).toEqual({ prompt: 'Ich sehe ___ Mann.', correct: 1, answer_given: 'den' });

    const xp = newDb.prepare('SELECT SUM(amount) AS s FROM xp_events').get() as { s: number };
    expect(xp.s).toBe(-20);
    expect(newDb.prepare('SELECT COUNT(*) AS c FROM review_log').get()).toEqual({ c: 1 });
    expect(newDb.prepare("SELECT value FROM user_meta WHERE key = 'streak_freezes'").get()).toEqual({
      value: '2',
    });
    expect(newDb.prepare("SELECT value FROM user_meta WHERE key = 'settings'").get()).toEqual({
      value: '{"themePreference":"dark","dailyNewLimit":20}',
    });
    expect(newDb.prepare('SELECT slug FROM reading_progress').all()).toEqual([{ slug: 'im-cafe' }]);
    expect(newDb.prepare('SELECT stars FROM path_progress').get()).toEqual({ stars: 3 });
    expect(newDb.prepare('SELECT games_played, texts_read FROM daily_activity').get()).toEqual({
      games_played: 2,
      texts_read: 1,
    });
    expect(newDb.prepare('SELECT score FROM game_results').get()).toEqual({ score: 900 });
    expect(newDb.prepare('SELECT reps FROM grammar_srs').get()).toEqual({ reps: 2 });
    expect(newDb.prepare("SELECT COUNT(*) AS c FROM quest_claims").get()).toEqual({ c: 1 });
    expect(newDb.prepare("SELECT COUNT(*) AS c FROM achievements_unlocked").get()).toEqual({ c: 1 });
    expect(newDb.prepare("SELECT COUNT(*) AS c FROM streak_freeze_days").get()).toEqual({ c: 1 });
    // migrations still own the schema version
    expect(newDb.prepare("SELECT value FROM user_meta WHERE key = 'schema_version'").get()).toEqual({
      value: String(MIGRATIONS.length),
    });
    newDb.close();
  });

  it('replaces existing data instead of merging, and drops rows whose content vanished', async () => {
    const oldDb = freshInstall(dir, 'old.db');
    seedUserData(oldDb);
    const doc = await createBackup(adapt(oldDb), '2026-08-09T12:00:00Z');
    oldDb.close();

    // a word that exists in no dictionary build
    doc.tables.user_saved_words.push({
      lemma: 'Zzzzwort',
      pos: 'noun',
      saved_at: '2026-08-01T00:00:00Z',
      note: null,
      learned_at: null,
      source: 'manual',
    });
    doc.tables.quiz_attempts.push({
      question_key: 'gone-topic|mc|Not a real prompt',
      correct: 0,
      answer_given: null,
      attempted_at: '2026-08-01T00:00:00Z',
    });

    const newDb = freshInstall(dir, 'new.db');
    // pre-existing data on the target device must not survive the restore
    newDb
      .prepare("INSERT INTO reading_progress (slug, completed_at) VALUES ('auf-dem-markt', '2026-08-08T00:00:00Z')")
      .run();
    newDb.prepare("INSERT INTO user_meta (key, value) VALUES ('last_streak_milestone', '30')").run();

    const summary = await restoreBackup(adapt(newDb), JSON.parse(JSON.stringify(doc)));
    expect(summary.dropped).toBe(2);
    expect(newDb.prepare('SELECT slug FROM reading_progress').all()).toEqual([{ slug: 'im-cafe' }]);
    expect(
      newDb.prepare("SELECT COUNT(*) AS c FROM user_meta WHERE key = 'last_streak_milestone'").get()
    ).toEqual({ c: 0 });
    expect(newDb.prepare('SELECT COUNT(*) AS c FROM user_saved_words').get()).toEqual({ c: 1 });
    newDb.close();
  });

  it('rejects files that are not Deutschly backups', async () => {
    const db = freshInstall(dir, 'x.db');
    await expect(restoreBackup(adapt(db), { foo: 1 } as unknown as BackupDoc)).rejects.toThrow(
      'not a Deutschly backup'
    );
    await expect(
      restoreBackup(adapt(db), {
        app: 'deutschly',
        format: BACKUP_FORMAT + 1,
        exported_at: 'x',
        schema_version: 8,
        tables: {},
      })
    ).rejects.toThrow('newer app version');
    db.close();
  });

  it('tolerates backups missing whole tables (older app versions)', async () => {
    const oldDb = freshInstall(dir, 'old.db');
    seedUserData(oldDb);
    const doc = await createBackup(adapt(oldDb), '2026-08-09T12:00:00Z');
    oldDb.close();

    // simulate a backup taken before v7/v8 existed
    delete doc.tables.reading_progress;
    delete doc.tables.path_progress;
    for (const row of doc.tables.daily_activity) {
      delete (row as Record<string, unknown>).texts_read;
      delete (row as Record<string, unknown>).path_lessons_done;
    }

    const newDb = freshInstall(dir, 'new.db');
    await restoreBackup(adapt(newDb), JSON.parse(JSON.stringify(doc)));
    expect(newDb.prepare('SELECT COUNT(*) AS c FROM reading_progress').get()).toEqual({ c: 0 });
    // missing columns fall back to their defaults
    expect(newDb.prepare('SELECT texts_read, reviews_done FROM daily_activity').get()).toEqual({
      texts_read: 0,
      reviews_done: 10,
    });
    newDb.close();
  });
});
