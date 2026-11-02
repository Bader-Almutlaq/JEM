import { parseBackupFileName } from './BackupFile';
import type { CloudBackupFile } from './CloudRetention';

/**
 * The files in a cloud folder that are this app's backups, newest first by Dropbox's server time.
 * A backup is an exact app file name in the app-folder root with a readable server time; anything else
 * (other files, folders' contents, look-alike names) is never offered for restore or deleted by retention.
 * Ties use the path, descending, so listing order cannot change the result.
 */
export function listCloudBackups(files: readonly CloudBackupFile[]): CloudBackupFile[] {
  return files
    .filter(
      (file) =>
        parseBackupFileName(file.name) !== undefined &&
        file.path === `/${file.name}` &&
        Number.isFinite(Date.parse(file.serverTime)),
    )
    .toSorted(
      (left, right) =>
        Date.parse(right.serverTime) - Date.parse(left.serverTime) || right.path.localeCompare(left.path),
    );
}
