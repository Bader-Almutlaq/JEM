import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import type { DropboxBackupState } from '../../data/dropbox/DropboxBackup';
import { DropboxBackupLine } from '../workout/DropboxBackupLine';
import { DropboxBackupSection } from './DropboxBackupSection';

const view = vi.hoisted(() => ({
  state: {
    enabled: true,
    phase: 'idle',
    connected: false,
    awaitingCode: false,
    reconnect: false,
    lastBackupAt: undefined,
    message: undefined,
  } as DropboxBackupState, // This fixture is checked against every field of the public view-state type.
}));
vi.mock('../../data/dropbox/useDropboxBackup', () => ({ useDropboxBackup: () => view.state }));
vi.mock('../../data/dropbox/cloudBackup', () => ({
  dropboxBackup: {},
  dropboxRedirectUri: 'https://example.com/workout-tracker/settings',
}));

afterEach(() => {
  view.state = {
    enabled: true,
    phase: 'idle',
    connected: false,
    awaitingCode: false,
    reconnect: false,
    lastBackupAt: undefined,
    message: undefined,
  };
});

function settingsMarkup(): string {
  return renderToStaticMarkup(createElement(DropboxBackupSection));
}

function finishMarkup(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(DropboxBackupLine)));
}

test('without a key Settings offers setup only and the finish row disappears', () => {
  view.state = { ...view.state, enabled: false, connected: true, message: 'old error' };
  expect(settingsMarkup()).toContain('Advanced: use your own Dropbox app');
  expect(settingsMarkup()).toContain('old error');
  expect(settingsMarkup()).not.toContain('Disconnect</button>');
  expect(finishMarkup()).toBe('');
});

test('disconnected Settings offers redirect connection and shows the copy-code field only for the fallback', () => {
  expect(settingsMarkup()).toContain('Open Dropbox');
  expect(settingsMarkup()).not.toContain('>Disconnect</button>');
  expect(finishMarkup()).toContain('Not connected');
  expect(settingsMarkup()).toContain('You&#x27;ll come straight back here.');
  expect(settingsMarkup()).toContain('Paste a code instead');
  expect(settingsMarkup()).not.toContain('id="dropbox-code"');
  expect(settingsMarkup()).not.toContain('<details open');
  view.state = { ...view.state, awaitingCode: true };
  const markup = settingsMarkup();
  expect(markup).toContain('2. Paste the code Dropbox shows');
  expect(markup).toContain('id="dropbox-code"');
  expect(markup).toContain('Connect</button>');
  expect(markup).not.toContain('come straight back here');
});

test('advanced setup shows the deployment redirect URI as selectable text', () => {
  const markup = settingsMarkup();
  expect(markup).toContain('under <strong>Redirect URIs</strong>');
  expect(markup).toContain('https://example.com/workout-tracker/settings</span>');
  expect(markup).toContain('aria-label="Copy the redirect link"');
});

test('advanced setup lists the three permissions, each with a copy button, and starts collapsed', () => {
  const markup = settingsMarkup();
  for (const permission of ['files.metadata.read', 'files.content.write', 'files.content.read']) {
    expect(markup).toContain(`>${permission}</span>`);
    expect(markup).toContain(`aria-label="Copy ${permission}"`);
  }
  expect(markup).toContain('Most people don&#x27;t need this');
});

test('connected Settings exposes manual cloud backup and Disconnect, disabling them during upload', () => {
  view.state = { ...view.state, connected: true, phase: 'backingUp' };
  const markup = settingsMarkup();
  expect(markup).toContain('Back up to Dropbox now');
  expect(markup).toContain('Disconnect');
  expect(markup).toContain('Backing up…');
  expect(markup).toContain('Restore from Dropbox…');
  expect(markup.match(/disabled=""/g)).toHaveLength(5);
});

test('restore is offered only while connected, and lists backups newest first with sizes', () => {
  expect(settingsMarkup()).not.toContain('Restore from Dropbox');
  const backups = [
    {
      name: 'WorkoutTracker-2026-10-31T12-00-00.sqlite',
      path: '/b',
      serverTime: '2026-10-31T12:00:00Z',
      sizeBytes: 2_621_440,
    },
    { name: 'WorkoutTracker-2026-10-30T12-00-00.sqlite', path: '/a', serverTime: '2026-10-30T12:00:00Z' },
  ];
  view.state = { ...view.state, connected: true, backups };
  const markup = settingsMarkup();
  expect(markup).toContain('Restore from Dropbox…');
  expect(markup).toContain('aria-label="Backups in Dropbox, newest first"');
  expect(markup).toContain('2.5 MB');
  expect(markup.indexOf('2.5 MB')).toBeLessThan(markup.lastIndexOf('<li'));
  expect(markup).toContain('Restore this backup?');
});

test('an empty Dropbox says so instead of showing an empty list', () => {
  view.state = { ...view.state, connected: true, backups: [] };
  const markup = settingsMarkup();
  expect(markup).toContain('No JEM backups were found in your Dropbox.');
  expect(markup).not.toContain('Backups in Dropbox, newest first');
});

test('finish failure has an alert and Try again; revoked connections instead link to Settings', () => {
  view.state = { ...view.state, connected: true, message: 'Check your connection.' };
  expect(finishMarkup()).toContain('role="alert"');
  expect(finishMarkup()).toContain('Try again');
  view.state = { ...view.state, connected: false, reconnect: true };
  expect(settingsMarkup()).toContain('Open Dropbox');
  expect(finishMarkup()).toContain('href="/settings"');
  expect(finishMarkup()).not.toContain('Try again');
});

test('status, first-backup confirmation and inline errors are visible with semantic status tokens', () => {
  view.state = {
    ...view.state,
    connected: true,
    notice: 'Connected. First backup saved to your Dropbox (Apps folder).',
  };
  expect(settingsMarkup()).toContain('data-status="good"');
  expect(settingsMarkup()).toContain('Connected · no backup yet');
  expect(finishMarkup()).toContain('Connected · no backup yet');
  expect(settingsMarkup()).toContain('First backup saved');
  view.state = {
    ...view.state,
    connected: false,
    codeMessage: 'Tap Open Dropbox first, then paste the new code.',
    appKeyMessage: "That doesn't look like a Dropbox app key.",
    appKeyInvalid: true,
  };
  expect(settingsMarkup()).toContain('id="dropbox-code-error"');
  expect(settingsMarkup()).toContain('id="dropbox-key-message"');
  expect(settingsMarkup()).toContain('aria-invalid="true"');
});
