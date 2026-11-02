import { expect, test } from 'vitest';
import { backupFileName } from '../../../core/backup/BackupFile';
import type { CloudBackupFile } from '../../../core/backup/CloudRetention';
import { restorableDropboxBackups } from './restorableDropboxBackups';

function file(timestamp: string): CloudBackupFile {
  const name = backupFileName(new Date(timestamp));
  return { name, path: `/${name}`, serverTime: '2020-01-01T00:00:00Z', size: 1024 };
}

test('filters exact root backup names and orders by filename time rather than server time or list order', () => {
  const older = file('2026-01-01T00:00:00Z');
  const newer = file('2026-11-02T12:00:00Z');
  expect(
    restorableDropboxBackups([
      { ...older, serverTime: '2027-01-01T00:00:00Z' },
      newer,
      { ...older, name: 'notes.sqlite' },
      { ...older, name: 'WorkoutTracker-2026-02-31T00-00-00.sqlite' },
      { ...older, path: `/nested/${older.name}` },
      { ...older, name: older.name.replace('.sqlite', ' (1).sqlite') },
    ]),
  ).toEqual([newer, { ...older, serverTime: '2027-01-01T00:00:00Z' }]);
  expect(restorableDropboxBackups([])).toEqual([]);
});
