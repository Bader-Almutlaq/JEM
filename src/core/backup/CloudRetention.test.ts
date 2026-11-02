import { afterEach, describe, expect, test, vi } from 'vitest';
import { backupFileName } from './BackupFile';
import { cloudBackupPathsToDelete, type CloudBackupFile } from './CloudRetention';

function file(time: string): CloudBackupFile {
  const name = backupFileName(new Date(time));
  return { name, path: `/${name}`, serverTime: time, size: 1024 };
}

function dailyFiles(count: number): CloudBackupFile[] {
  return Array.from({ length: count }, (_, index) => file(`2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`));
}

afterEach(() => vi.unstubAllEnvs());

describe('cloudBackupPathsToDelete', () => {
  test('deletes nothing with 14 or fewer valid backups, including an empty folder', () => {
    expect(cloudBackupPathsToDelete([])).toEqual([]);
    expect(cloudBackupPathsToDelete(dailyFiles(14))).toEqual([]);
    expect(cloudBackupPathsToDelete(dailyFiles(1))).toEqual([]);
  });

  test('keeps newest 14 and the first backup of the month, independent of list order', () => {
    const files = dailyFiles(20);
    const deletions = cloudBackupPathsToDelete(files.toReversed());
    expect(deletions).toEqual(files.slice(1, 6).map((entry) => entry.path));
    for (const newest of files.slice(-14)) expect(deletions).not.toContain(newest.path);
  });

  test('retains the earliest backup of every month, using server time rather than the filename', () => {
    const january = { ...file('2026-01-02T12:00:00Z'), serverTime: '2026-01-01T12:00:00Z' };
    const laterJanuary = { ...file('2026-01-01T12:00:00Z'), serverTime: '2026-01-02T12:00:00Z' };
    const february = file('2026-02-01T12:00:00Z');
    expect(cloudBackupPathsToDelete([laterJanuary, ...dailyFiles(14), january, february])).toEqual([laterJanuary.path]);
  });

  test('groups month boundaries in local time, on both sides of UTC', () => {
    const first = file('2026-09-30T23:30:00Z');
    const second = file('2026-10-01T01:30:00Z');
    const third = file('2026-10-01T05:30:00Z');
    vi.stubEnv('TZ', 'America/New_York');
    expect(cloudBackupPathsToDelete([first, second, third, ...dailyFiles(14)])).toEqual([second.path]);
    vi.stubEnv('TZ', 'Asia/Riyadh');
    expect(cloudBackupPathsToDelete([first, second, third, ...dailyFiles(14)])).toEqual([second.path, third.path]);
  });

  test('ignores other names, impossible dates, nested paths, and invalid server timestamps', () => {
    const files = dailyFiles(20);
    const outsiders = [
      { ...file('2025-01-01T00:00:00Z'), name: 'notes.sqlite' },
      { ...file('2025-01-01T00:00:00Z'), name: 'WorkoutTracker-2025-02-31T00-00-00.sqlite' },
      { ...file('2025-01-01T00:00:00Z'), path: '/other/WorkoutTracker-2025-01-01T00-00-00.sqlite' },
      { ...file('2025-01-01T00:00:00Z'), serverTime: 'unreadable' },
      { ...file('2025-01-01T00:00:00Z'), name: 'WorkoutTracker-2025-01-01T00-00-00 (1).sqlite' },
    ];
    expect(cloudBackupPathsToDelete([...outsiders, ...files])).toEqual(cloudBackupPathsToDelete(files));
  });

  test('uses deterministic path order for tied server times', () => {
    const files = dailyFiles(16).map((entry) => ({ ...entry, serverTime: '2026-10-01T12:00:00Z' }));
    expect(cloudBackupPathsToDelete(files)).toEqual([files[1]?.path]);
    expect(cloudBackupPathsToDelete(files.toReversed())).toEqual([files[1]?.path]);
  });
});
