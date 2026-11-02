import { parseBackupFileName } from '../../../core/backup/BackupFile';
import type { CloudBackupFile } from '../../../core/backup/CloudRetention';

/** Exact root backup names, newest filename time first (UTC names sort chronologically); server times do not order restore choices. */
export function restorableDropboxBackups(files: readonly CloudBackupFile[]): CloudBackupFile[] {
  return files
    .filter((file) => parseBackupFileName(file.name) !== undefined && file.path === `/${file.name}`)
    .toSorted((left, right) => right.name.localeCompare(left.name));
}
