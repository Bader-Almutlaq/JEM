import { describe, expect, test } from 'vitest';
import { backupFileName } from './BackupFile';
import { listCloudBackups } from './CloudBackupListing';
import type { CloudBackupFile } from './CloudRetention';

function file(timestamp: string, overrides: Partial<CloudBackupFile> = {}): CloudBackupFile {
  const name = backupFileName(new Date(timestamp));
  return { name, path: `/${name}`, serverTime: timestamp, ...overrides };
}

describe('listCloudBackups', () => {
  test('returns app backups newest first regardless of listing order', () => {
    const files = [file('2026-10-01T10:00:00Z'), file('2026-10-03T10:00:00Z'), file('2026-10-02T10:00:00Z')];
    expect(listCloudBackups(files).map((entry) => entry.serverTime)).toEqual([
      '2026-10-03T10:00:00Z',
      '2026-10-02T10:00:00Z',
      '2026-10-01T10:00:00Z',
    ]);
  });

  test('leaves out other files, nested paths, look-alike names and unreadable times', () => {
    const good = file('2026-10-01T10:00:00Z');
    const files = [
      good,
      { name: 'notes.txt', path: '/notes.txt', serverTime: '2026-10-02T10:00:00Z' },
      { name: 'WorkoutTracker-2026-13-45T10-00-00.sqlite', path: '/x', serverTime: '2026-10-02T10:00:00Z' },
      file('2026-10-04T10:00:00Z', { path: '/archive/WorkoutTracker-2026-10-04T10-00-00.sqlite' }),
      file('2026-10-05T10:00:00Z', { serverTime: 'not a time' }),
    ];
    expect(listCloudBackups(files)).toEqual([good]);
  });

  test('breaks equal server times by path so the order is stable', () => {
    const a = file('2026-10-01T10:00:00Z');
    const b = file('2026-10-01T10:00:00Z', { name: backupFileName(new Date('2026-10-01T10:00:01Z')) });
    const forward = listCloudBackups([a, b]).map((entry) => entry.path);
    expect(listCloudBackups([b, a]).map((entry) => entry.path)).toEqual(forward);
  });

  test('does not change its input', () => {
    const files = [file('2026-10-01T10:00:00Z'), file('2026-10-03T10:00:00Z')];
    const copy = [...files];
    listCloudBackups(files);
    expect(files).toEqual(copy);
  });
});
