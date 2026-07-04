/**
 * Database bootstrap. The bundled dictionary is imported from assets on first
 * launch; user tables are created by migration afterwards.
 * (Dictionary import lands with the data pipeline — this stub keeps the app
 * bootable until then.)
 */
export async function initDatabase(): Promise<void> {
  // TODO(data-pipeline): importDatabaseFromAssetAsync + user-table migrations
}
