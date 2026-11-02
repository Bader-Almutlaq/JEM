import { parseBackupFileName } from './BackupFile';
import { localDateKey } from '../support/localDate';

/** A root-folder file listed by Dropbox; serverTime is Dropbox's UTC server_modified timestamp. */
export interface CloudBackupFile {
  readonly name: string;
  readonly path: string;
  readonly serverTime: string;
  /** File length in bytes, supplied by Dropbox. */
  readonly size: number;
}

/** Heuristic: retain two weeks of recent backups plus the earliest surviving backup of every local month. */
export const CloudRetention = { newestToKeep: 14 } as const;

/**
 * Paths to delete, oldest first, keeping the newest 14 and each local month's earliest server time.
 * Only exact app backup names in the app-folder root with readable server times are candidates.
 * Ties use the path, so listing order cannot change which backups survive.
 */
export function cloudBackupPathsToDelete(files: readonly CloudBackupFile[]): string[] {
  const candidates = files
    .filter(
      (file) =>
        parseBackupFileName(file.name) !== undefined &&
        file.path === `/${file.name}` &&
        Number.isFinite(Date.parse(file.serverTime)),
    )
    .toSorted(
      (left, right) =>
        Date.parse(left.serverTime) - Date.parse(right.serverTime) || left.path.localeCompare(right.path),
    );
  if (candidates.length <= CloudRetention.newestToKeep) return [];
  const keep = new Set(candidates.slice(-CloudRetention.newestToKeep).map((file) => file.path));
  const months = new Set<string>();
  for (const file of candidates) {
    const month = localDateKey(file.serverTime).slice(0, 'YYYY-MM'.length);
    if (!months.has(month)) {
      months.add(month);
      keep.add(file.path);
    }
  }
  return candidates.filter((file) => !keep.has(file.path)).map((file) => file.path);
}
