/**
 * In-place content update for app updates: replaces the read-only content
 * tables (lemmas, forms, senses, examples, grammar tables, meta) of the
 * installed database with those from a freshly imported bundle — WITHOUT touching
 * the user's data, which lives in the same file.
 *
 * Content row ids are not stable across builds, so user rows that reference
 * content are remapped via natural keys first:
 *   - saved words / SRS state / review log → lemma + pos
 *   - quiz attempts → topic slug + qtype + question prompt
 * Rows whose content no longer exists are dropped.
 *
 * Everything runs in ONE transaction on the main database file: if the app
 * dies mid-update, the rollback journal restores the previous state and the
 * update is retried on the next launch. (Complementary to the versioned
 * user-schema migrations in src/db/migrations.ts, which must have run
 * before this is applied.)
 */

/** Minimal surface shared by expo-sqlite and the better-sqlite3 test shim. */
export interface UpdateDb {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string): Promise<T[]>;
}

/**
 * Natural key for a grammar question: topic slug + qtype + main prompt
 * field. Used to carry quiz history across content updates; questions whose
 * key changed (or is ambiguous) simply lose their history.
 */
const QUESTION_KEY = (db: 'main' | 'newc') => `
  SELECT q.id AS id,
         t.slug || '|' || q.qtype || '|' || COALESCE(
           json_extract(q.payload, '$.prompt'),
           json_extract(q.payload, '$.sentence'),
           json_extract(q.payload, '$.tokens'),
           q.payload
         ) AS k
  FROM ${db}.grammar_questions q JOIN ${db}.grammar_topics t ON t.id = q.topic_id`;

/** Tables owned by the user whose rows reference content ids. */
const USER_REFS: { table: string; column: string; map: string }[] = [
  { table: 'user_saved_words', column: 'lemma_id', map: 'lemma_map' },
  { table: 'srs_state', column: 'lemma_id', map: 'lemma_map' },
  { table: 'review_log', column: 'lemma_id', map: 'lemma_map' },
  { table: 'quiz_attempts', column: 'question_id', map: 'question_map' },
];

async function hasTable(db: UpdateDb, schema: string, name: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name = '${name}'`
  );
  return rows.length > 0;
}

export async function applyContentUpdate(db: UpdateDb, newContentPath: string): Promise<void> {
  const quotedPath = newContentPath.replaceAll("'", "''");
  await db.execAsync('PRAGMA foreign_keys = OFF');
  await db.execAsync(`ATTACH DATABASE '${quotedPath}' AS newc`);
  try {
    await db.execAsync('BEGIN');

    // ---- id maps (old content must still be readable here) ----
    await db.execAsync(`
      CREATE TEMP TABLE lemma_map AS
        SELECT o.id AS old_id, n.id AS new_id
        FROM main.lemmas o JOIN newc.lemmas n ON n.lemma = o.lemma AND n.pos = o.pos`);

    if (await hasTable(db, 'main', 'grammar_questions')) {
      await db.execAsync(`
        CREATE TEMP TABLE q_old AS ${QUESTION_KEY('main')};
        CREATE TEMP TABLE q_new AS ${QUESTION_KEY('newc')};
        CREATE TEMP TABLE question_map AS
          SELECT o.id AS old_id, n.id AS new_id
          FROM q_old o JOIN q_new n ON n.k = o.k
          WHERE o.k IN (SELECT k FROM q_old GROUP BY k HAVING COUNT(*) = 1)
            AND n.k IN (SELECT k FROM q_new GROUP BY k HAVING COUNT(*) = 1);
        DROP TABLE q_old;
        DROP TABLE q_new;`);
    } else {
      await db.execAsync('CREATE TEMP TABLE question_map (old_id INTEGER, new_id INTEGER)');
    }

    // ---- remap user rows onto new ids ----
    // Two passes via negated ids so intermediate values can never collide
    // with a primary key that is still waiting to be remapped.
    for (const { table, column, map } of USER_REFS) {
      await db.execAsync(`
        UPDATE ${table}
           SET ${column} = -(SELECT new_id FROM ${map} WHERE old_id = ${column})
         WHERE ${column} IN (SELECT old_id FROM ${map});
        DELETE FROM ${table} WHERE ${column} > 0;
        UPDATE ${table} SET ${column} = -${column};`);
    }
    await db.execAsync('DROP TABLE lemma_map; DROP TABLE question_map;');

    // ---- swap content tables for the bundled versions ----
    const tables = await db.getAllAsync<{ name: string; sql: string }>(
      `SELECT name, sql FROM newc.sqlite_master
       WHERE type = 'table' AND sql IS NOT NULL
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'senses_fts_%'`
    );
    for (const t of tables) await db.execAsync(`DROP TABLE IF EXISTS main."${t.name}"`);
    for (const t of tables) await db.execAsync(t.sql); // unqualified DDL creates in main
    for (const t of tables) {
      if (t.name === 'senses_fts') continue; // contentless FTS — rebuilt below
      await db.execAsync(`INSERT INTO main."${t.name}" SELECT * FROM newc."${t.name}"`);
    }
    const indexes = await db.getAllAsync<{ sql: string }>(
      `SELECT sql FROM newc.sqlite_master
       WHERE type = 'index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`
    );
    for (const i of indexes) await db.execAsync(i.sql);
    await db.execAsync("INSERT INTO senses_fts(senses_fts) VALUES('rebuild')");

    await db.execAsync('COMMIT');
  } catch (err) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.execAsync('DETACH DATABASE newc').catch(() => {});
    await db.execAsync('PRAGMA foreign_keys = ON').catch(() => {});
  }
}
