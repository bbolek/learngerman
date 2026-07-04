import * as SQLite from 'expo-sqlite';

import { runMigrations } from '@/db/migrations';

const DB_NAME = 'dictionary.db';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Import the bundled dictionary on first launch (never overwrites — user
 * tables live in the same file), open it, and apply user-data migrations.
 */
export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  initPromise ??= (async () => {
    await SQLite.importDatabaseFromAssetAsync(DB_NAME, {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      assetId: require('../../assets/db/dictionary.db'),
    });
    const opened = await SQLite.openDatabaseAsync(DB_NAME);
    await runMigrations(opened);
    db = opened;
    return opened;
  })();
  return initPromise;
}

/** Synchronous handle for code that runs after the root layout gate. */
export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized — initDatabase() must complete first');
  return db;
}
