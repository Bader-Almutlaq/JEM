import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { backupFileName } from '../../../core/backup/BackupFile';
import type { DropboxBackupState } from '../../data/dropbox/DropboxBackup';
import { DropboxRestoreSheet } from './DropboxRestoreSheet';
import { RestoreBackupConfirmation } from './RestoreBackupConfirmation';
import { RestoreDataCard } from '../workout/RestoreDataCard';

const view = vi.hoisted(() => ({
  state: {
    enabled: true,
    phase: 'idle',
    connected: true,
    awaitingCode: false,
    reconnect: false,
    lastBackupAt: undefined,
    message: undefined,
  } as DropboxBackupState, // The fixture supplies every required public state field.
  empty: true,
}));
vi.mock('../../data/dropbox/useDropboxBackup', () => ({ useDropboxBackup: () => view.state }));
vi.mock('../../data/dropbox/cloudBackup', () => ({
  dropboxBackup: {},
  dropboxRedirectUri: 'https://example.com/settings',
}));
vi.mock('../../data/database', () => ({
  database: {},
  useDatabaseQuery: () => ({ status: 'ready', value: view.empty }),
}));

afterEach(() => {
  view.empty = true;
  view.state = {
    enabled: true,
    phase: 'idle',
    connected: true,
    awaitingCode: false,
    reconnect: false,
    lastBackupAt: undefined,
    message: undefined,
  };
});

function markup(): string {
  return renderToStaticMarkup(createElement(DropboxRestoreSheet));
}

test('sheet is absent until explicitly opened or requested after connection', () => {
  expect(markup()).toBe('');
});

test('initial list shows only 30 backups with locale dates and byte sizes, plus Show older', () => {
  const backups = Array.from({ length: 31 }, (_, index) => {
    const name = backupFileName(new Date(Date.UTC(2026, 9, index + 1)));
    return { name, path: `/${name}`, size: index === 0 ? 1500 : 2_000_000, serverTime: '2026-11-01' };
  });
  view.state = { ...view.state, restoreOpen: true, backups };
  const html = markup();
  expect(html.match(/<button/g)).toHaveLength(32);
  expect(html).toContain('Show older');
  expect(html).toContain('1.5 kB');
  expect(html).toContain('2 MB');
  expect(html).toContain(new Date(Date.UTC(2026, 9, 1)).toLocaleString());
  expect(html).not.toContain(new Date(Date.UTC(2026, 9, 31)).toLocaleString());
});

test.each([
  ['listing', 'Loading backups…'],
  ['downloading', 'Downloading…'],
  ['restoring', 'Restoring…'],
] as const)('shows %s progress without enabled backup choices', (phase, text) => {
  view.state = { ...view.state, restoreOpen: true, phase };
  expect(markup()).toContain(text);
  expect(markup()).toContain('role="status"');
});

test('empty, failed and successful discovery/restore states stay visible', () => {
  view.state = { ...view.state, restoreOpen: true, backups: [] };
  expect(markup()).toContain('No backups found');
  view.state = { ...view.state, message: 'No connection.' };
  expect(markup()).toContain('role="alert"');
  expect(markup()).toContain('Try again');
  view.state = { ...view.state, message: undefined, notice: 'Restored 12 workouts.' };
  expect(markup()).toContain('Restored 12 workouts.');
});

test('shared confirmation states replacement and the safety snapshot', () => {
  const html = renderToStaticMarkup(
    createElement(RestoreBackupConfirmation, {
      detail: 'Synthetic backup',
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
  );
  expect(html).toContain('Restore this backup?');
  expect(html).toContain('It replaces what is on this phone. Your current data is kept as a safety snapshot.');
  expect(html).toContain('Replace data');
});

test('the fresh-phone card exposes both restore paths and disappears when there is data', () => {
  let html = renderToStaticMarkup(createElement(RestoreDataCard));
  expect(html).toContain('Restore your data');
  expect(html).toContain('Restore from Dropbox');
  expect(html).toContain('Restore from a file');
  expect(html).toContain('accept=".sqlite"');
  view.empty = false;
  html = renderToStaticMarkup(createElement(RestoreDataCard));
  expect(html).not.toContain('Restore your data');
  expect(html).not.toContain('Restore from a file');
  expect(html).not.toContain('<button');
});
