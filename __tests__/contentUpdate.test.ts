import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import contentMeta from '../assets/db/content-meta.json';
import { MIGRATIONS } from '@/db/migrations';
import { applyContentUpdate, type UpdateDb } from '@/logic/contentUpdate';

const BUILT = path.join(__dirname, '../assets/db/dictionary.db');
const ID_SHIFT = 5000;

function adapt(db: Database.Database): UpdateDb {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async getAllAsync<T>(sql: string) {
      return db.prepare(sql).all() as T[];
    },
  };
}

/**
 * Simulates an installed app from an older release: same schema, but all
 * content ids differ from the current build (they are assigned in build
 * order, which changes whenever content is inserted or reordered), with
 * user data referencing those old ids.
 */
function makeOldInstall(dir: string) {
  const oldPath = path.join(dir, 'installed.db');
  fs.copyFileSync(BUILT, oldPath);
  const db = new Database(oldPath);
  db.pragma('foreign_keys = OFF');
  for (const m of MIGRATIONS) db.exec(m);
  db.exec(`UPDATE lemmas SET id = id + ${ID_SHIFT}`);
  db.exec(`UPDATE grammar_questions SET id = id + ${ID_SHIFT}`);
  db.exec("UPDATE meta SET value = 'old-hash' WHERE key = 'content_hash'");

  const oldMachenId = (
    db.prepare("SELECT id FROM lemmas WHERE lemma = 'machen' AND pos = 'verb'").get() as { id: number }
  ).id;
  const oldQuestionId = (
    db
      .prepare(
        `SELECT q.id FROM grammar_questions q
         WHERE json_extract(q.payload, '$.prompt') = 'Ich sehe ___ Mann.'`
      )
      .get() as { id: number }
  ).id;

  db.prepare("INSERT INTO user_saved_words (lemma_id, saved_at, note) VALUES (?, ?, 'merken!')").run(
    oldMachenId,
    '2026-07-01T10:00:00Z'
  );
  db.prepare(
    `INSERT INTO srs_state (lemma_id, ease, interval_days, reps, lapses, due_at)
     VALUES (?, 2.1, 5, 3, 1, '2026-07-09T10:00:00Z')`
  ).run(oldMachenId);
  db.prepare(
    'INSERT INTO review_log (lemma_id, rating, reviewed_at, interval_before, interval_after) VALUES (?, 4, ?, 2, 5)'
  ).run(oldMachenId, '2026-07-04T10:00:00Z');
  db.prepare(
    "INSERT INTO quiz_attempts (question_id, correct, answer_given, attempted_at) VALUES (?, 1, '{}', '2026-07-04T11:00:00Z')"
  ).run(oldQuestionId);

  // a saved word whose lemma no longer exists in the new content
  db.prepare(`
    INSERT INTO lemmas (id, lemma, lemma_norm, lemma_fold, lemma_plain, pos, level)
    VALUES (99999, 'Zzzzwort', 'zzzzwort', 'zzzzwort', 'zzzzwort', 'noun', 'A1')`).run();
  db.prepare('INSERT INTO user_saved_words (lemma_id) VALUES (99999)').run();
  db.prepare(
    "INSERT INTO srs_state (lemma_id, ease, interval_days, reps, lapses, due_at) VALUES (99999, 2.5, 0, 0, 0, '2026-07-05T00:00:00Z')"
  ).run();
  // an attempt for a question that no longer exists
  db.prepare(
    "INSERT INTO quiz_attempts (question_id, correct, answer_given, attempted_at) VALUES (999999, 0, '{}', '2026-07-04T12:00:00Z')"
  ).run();

  db.prepare("INSERT INTO daily_activity (day, reviews_done, quiz_done, words_saved) VALUES ('2026-07-01', 3, 2, 1)").run();
  db.prepare("INSERT INTO user_meta (key, value) VALUES ('onboarded', 'yes')").run();
  db.close();
  return oldPath;
}

describe('applyContentUpdate', () => {
  let dir: string;
  let oldPath: string;
  let newPath: string;
  let db: Database.Database;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-content-update-'));
    oldPath = makeOldInstall(dir);
    newPath = path.join(dir, 'bundled.db');
    fs.copyFileSync(BUILT, newPath);
    db = new Database(oldPath);
    await applyContentUpdate(adapt(db), newPath);
  });

  afterAll(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('replaces content with the bundled version (hash + counts match)', () => {
    const fresh = new Database(BUILT, { readonly: true });
    const count = (d: Database.Database, t: string) =>
      (d.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
    for (const t of ['lemmas', 'forms', 'senses', 'examples', 'grammar_topics', 'grammar_questions']) {
      expect(count(db, t)).toBe(count(fresh, t));
    }
    const hash = db.prepare("SELECT value FROM meta WHERE key = 'content_hash'").get() as { value: string };
    expect(hash.value).toBe(contentMeta.hash);
    fresh.close();
  });

  it('remaps saved words, SRS state and review log onto new lemma ids', () => {
    const newMachenId = (
      db.prepare("SELECT id FROM lemmas WHERE lemma = 'machen' AND pos = 'verb'").get() as { id: number }
    ).id;
    expect(newMachenId).toBeLessThan(ID_SHIFT); // proves ids actually changed

    const saved = db.prepare('SELECT * FROM user_saved_words WHERE lemma_id = ?').get(newMachenId) as any;
    expect(saved?.note).toBe('merken!');
    const srs = db.prepare('SELECT * FROM srs_state WHERE lemma_id = ?').get(newMachenId) as any;
    expect(srs).toMatchObject({ ease: 2.1, interval_days: 5, reps: 3, lapses: 1 });
    const log = db.prepare('SELECT * FROM review_log WHERE lemma_id = ?').get(newMachenId) as any;
    expect(log?.rating).toBe(4);
  });

  it('remaps quiz attempts onto new question ids by topic + prompt', () => {
    const newQId = (
      db
        .prepare(
          `SELECT q.id FROM grammar_questions q
           WHERE json_extract(q.payload, '$.prompt') = 'Ich sehe ___ Mann.'`
        )
        .get() as { id: number }
    ).id;
    const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE question_id = ?').get(newQId) as any;
    expect(attempt?.correct).toBe(1);
  });

  it('drops user rows whose content disappeared', () => {
    const saved = db.prepare('SELECT COUNT(*) c FROM user_saved_words').get() as { c: number };
    expect(saved.c).toBe(1); // Zzzzwort dropped, machen kept
    const srs = db.prepare('SELECT COUNT(*) c FROM srs_state').get() as { c: number };
    expect(srs.c).toBe(1);
    const attempts = db.prepare('SELECT COUNT(*) c FROM quiz_attempts').get() as { c: number };
    expect(attempts.c).toBe(1); // unknown question dropped
  });

  it('leaves content-independent user data untouched', () => {
    const day = db.prepare("SELECT * FROM daily_activity WHERE day = '2026-07-01'").get() as any;
    expect(day).toMatchObject({ reviews_done: 3, quiz_done: 2, words_saved: 1 });
    const meta = db.prepare("SELECT value FROM user_meta WHERE key = 'onboarded'").get() as any;
    expect(meta?.value).toBe('yes');
  });

  it('new content is fully usable: schema, FTS and FK integrity', () => {
    // new column from this release exists
    expect(() => db.prepare('SELECT vocab_count FROM grammar_topics LIMIT 1').get()).not.toThrow();
    // FTS index was rebuilt against the new senses
    const fts = db.prepare("SELECT COUNT(*) c FROM senses_fts WHERE senses_fts MATCH 'house'").get() as {
      c: number;
    };
    expect(fts.c).toBeGreaterThan(0);
    // no dangling references remain
    db.exec('PRAGMA foreign_keys = ON');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('is a no-op when run twice (ids already match)', async () => {
    await applyContentUpdate(adapt(db), newPath);
    const saved = db.prepare('SELECT COUNT(*) c FROM user_saved_words').get() as { c: number };
    expect(saved.c).toBe(1);
  });
});
