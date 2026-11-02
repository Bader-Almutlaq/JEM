import { expect, test } from 'vitest';
import type { DropboxBackupState } from './DropboxBackup';
import { dropboxCaption, dropboxStatusTone } from './dropboxCaption';

const NOW = new Date('2026-10-31T12:00:00Z');
const CONNECTED: DropboxBackupState = {
  enabled: true,
  phase: 'idle',
  connected: true,
  awaitingCode: false,
  reconnect: false,
  lastBackupAt: '2026-10-31T11:58:00Z',
  message: undefined,
};

test('connection caption describes minutes, hours, days, missing and unreadable timestamps', () => {
  expect(dropboxCaption(CONNECTED, NOW)).toBe('Connected · last backup 2 min ago');
  expect(dropboxCaption({ ...CONNECTED, lastBackupAt: '2026-10-31T11:00:00Z' }, NOW)).toBe(
    'Connected · last backup 1 hr ago',
  );
  expect(dropboxCaption({ ...CONNECTED, lastBackupAt: '2026-10-30T12:00:00Z' }, NOW)).toBe(
    'Connected · last backup 1 day ago',
  );
  expect(dropboxCaption({ ...CONNECTED, lastBackupAt: '2026-10-29T12:00:00Z' }, NOW)).toBe(
    'Connected · last backup 2 days ago',
  );
  expect(dropboxCaption({ ...CONNECTED, lastBackupAt: undefined }, NOW)).toBe('Connected · no backup yet');
  expect(dropboxCaption({ ...CONNECTED, lastBackupAt: 'invalid' }, NOW)).toBe('Connected · no backup yet');
});

test('finish caption gives progress, success, and readable failure priority over a previous backup', () => {
  const recent = { ...CONNECTED, lastBackupAt: NOW.toISOString() };
  expect(dropboxCaption({ ...recent, phase: 'backingUp' }, NOW)).toBe('Backing up…');
  expect(dropboxCaption(recent, NOW)).toBe('Connected · last backup just now');
  expect(dropboxCaption({ ...recent, message: 'Check your connection.' }, NOW)).toBe('Check your connection.');
  expect(dropboxCaption({ ...recent, lastBackupAt: '2026-11-01T12:00:00Z' }, NOW)).toBe(
    'Connected · last backup just now',
  );
});

test('describes loading, authorization, disconnect and reconnect states', () => {
  expect(dropboxCaption({ ...CONNECTED, phase: 'loading' }, NOW)).toBe('Checking Dropbox…');
  expect(dropboxCaption({ ...CONNECTED, phase: 'authorizing' }, NOW)).toBe('Connecting…');
  expect(dropboxCaption({ ...CONNECTED, phase: 'disconnecting' }, NOW)).toBe('Disconnecting…');
  expect(dropboxCaption({ ...CONNECTED, connected: false, reconnect: true }, NOW)).toBe(
    'Reconnect Dropbox to continue automatic backups.',
  );
  expect(dropboxCaption({ ...CONNECTED, connected: false }, NOW)).toBe('Not connected');
});

test('all phases and connection outcomes have a matching semantic status', () => {
  expect(dropboxStatusTone(CONNECTED)).toBe('good');
  expect(dropboxStatusTone({ ...CONNECTED, connected: false })).toBe('neutral');
  expect(dropboxStatusTone({ ...CONNECTED, reconnect: true })).toBe('bad');
  expect(dropboxStatusTone({ ...CONNECTED, message: 'A problem.' })).toBe('bad');
  for (const phase of ['loading', 'authorizing', 'backingUp', 'disconnecting'] as const) {
    expect(dropboxStatusTone({ ...CONNECTED, phase, message: 'Old problem.' })).toBe('neutral');
  }
  expect(dropboxCaption({ ...CONNECTED, connected: false, awaitingCode: true }, NOW)).toBe('Not connected');
});
