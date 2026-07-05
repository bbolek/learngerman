import * as SQLite from 'expo-sqlite';

import contentMeta from '../../assets/db/content-meta.json';
import { runMigrations } from '@/db/migrations';
import { applyContentUpdate } from '@/logic/contentUpdate';

const DB_NAME = 'dictionary.db';
/** Staging import of the bundled DB while an in-place content update runs. */
const STAGED_NAME = 'dictionary-staged.db';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bundledDbAsset = () => require('../../assets/db/dictionary.db');

async function storedContentHash(opened: SQLite.SQLiteDatabase): Promise<string | null> {
  try {
    const row = await opened.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'content_hash'"
    );
    return row?.value ?? null;
  } catch {
    return null; // pre-hash installs: meta exists but has no content_hash row
  }
}

/**
 * Bring the installed DB's content tables up to date with the bundle.
 * The bundled asset is imported next to the real DB, then swapped in by
 * applyContentUpdate() inside one transaction — user data is remapped, and
 * a failure leaves the previous content fully intact.
 */
async function updateContentIfStale(opened: SQLite.SQLiteDatabase): Promise<void> {
  if ((await storedContentHash(opened)) === contentMeta.hash) return;
  try {
    await SQLite.deleteDatabaseAsync(STAGED_NAME).catch(() => {});
    await SQLite.importDatabaseFromAssetAsync(STAGED_NAME, { assetId: bundledDbAsset() });
    const staged = await SQLite.openDatabaseAsync(STAGED_NAME);
    const loc = await staged.getFirstAsync<{ file: string }>('PRAGMA database_list');
    await staged.closeAsync();
    if (!loc?.file) throw new Error('could not resolve staged database path');
    await applyContentUpdate(opened, loc.file);
    await opened.execAsync('VACUUM');
  } finally {
    await SQLite.deleteDatabaseAsync(STAGED_NAME).catch(() => {});
  }
}

/**
 * Import the bundled dictionary on first launch (never overwrites — user
 * tables live in the same file), open it, apply user-data migrations, then
 * refresh the content tables in place if the app update shipped new content.
 */
export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  initPromise ??= (async () => {
    await SQLite.importDatabaseFromAssetAsync(DB_NAME, { assetId: bundledDbAsset() });
    const opened = await SQLite.openDatabaseAsync(DB_NAME);
    await runMigrations(opened);
    try {
      await updateContentIfStale(opened);
    } catch (err) {
      // Never block launch on a failed update — the previous content still
      // works, and the stale hash retries the update on the next start.
      console.warn('[db] content update failed — keeping existing content', err);
    }
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
