/**
 * File plumbing around src/logic/backup.ts: export the user's data as a JSON
 * file handed to the system share sheet (so it lands OUTSIDE the app sandbox
 * — Files/iCloud Drive on iOS, Drive/Downloads on Android — and survives
 * uninstalling the app), and restore from a file picked with the system
 * document picker after a reinstall.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDb } from '@/db/client';
import { createBackup, restoreBackup, type RestoreSummary } from '@/logic/backup';

/**
 * Serialize the user's data and open the share sheet so they can put the
 * file somewhere that outlives the app install.
 */
export async function exportBackupFile(): Promise<void> {
  const doc = await createBackup(getDb(), new Date().toISOString());
  const day = doc.exported_at.slice(0, 10);
  const file = new File(Paths.cache, `deutschly-backup-${day}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(doc));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Deutschly-Backup speichern',
    });
  } finally {
    file.delete();
  }
}

/**
 * Let the user pick a previously exported backup and replace the current
 * user state with it. Returns null if the picker was dismissed.
 */
export async function importBackupFile(): Promise<RestoreSummary | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const raw = await new File(picked.assets[0].uri).text();
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error('not a Deutschly backup file');
  }
  return restoreBackup(getDb(), doc);
}
