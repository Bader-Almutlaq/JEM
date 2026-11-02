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
vi.mock('../../data/dropbox/cloudBackup', () => ({ dropboxBackup: {} }));

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
  expect(settingsMarkup()).toContain('Dropbox app and reset');
  expect(settingsMarkup()).toContain('old error');
  expect(settingsMarkup()).not.toContain('Disconnect</button>');
  expect(finishMarkup()).toBe('');
});

test('Owner decision: the only way to connect is open Dropbox, then paste its code', () => {
  const markup = settingsMarkup();
  expect(markup).toContain('1. Open Dropbox, tap <strong>Allow</strong>, and copy the code it shows.');
  expect(markup).toContain('Open Dropbox');
  expect(markup).toContain('2. Paste the code Dropbox shows');
  expect(markup).not.toContain('come straight back here');
  expect(markup).not.toContain('Paste a code instead');
  expect(markup).not.toContain('Redirect URIs');
  expect(markup).not.toContain('>Disconnect</button>');
  expect(finishMarkup()).toContain('Not connected');
  // The code field is there from the start but waits for Open Dropbox.
  expect(markup).toContain('Open Dropbox first.');
  view.state = { ...view.state, awaitingCode: true };
  expect(settingsMarkup()).not.toContain('Open Dropbox first.');
});

test('the Dropbox app section says which app is in use and lists the three permissions with copy buttons, collapsed', () => {
  const markup = settingsMarkup();
  for (const permission of ['files.metadata.read', 'files.content.write', 'files.content.read']) {
    expect(markup).toContain(`>${permission}</span>`);
    expect(markup).toContain(`aria-label="Copy ${permission}"`);
  }
  expect(markup).toContain('JEM&#x27;s built-in Dropbox app');
  expect(markup).not.toContain('<details open');
});

test('Reset is offered only when there is something on this phone to forget', () => {
  expect(settingsMarkup()).not.toContain('Reset Dropbox on this phone');
  view.state = { ...view.state, connected: true };
  expect(settingsMarkup()).toContain('Reset Dropbox on this phone');
  view.state = { ...view.state, connected: false, customAppKey: 'abcde12345' };
  expect(settingsMarkup()).toContain('Reset Dropbox on this phone');
  view.state = { ...view.state, customAppKey: undefined, awaitingCode: true };
  expect(settingsMarkup()).toContain('Reset Dropbox on this phone');
});

test('connected Settings exposes manual cloud backup and Disconnect, disabling them during upload', () => {
  view.state = { ...view.state, connected: true, phase: 'backingUp' };
  const markup = settingsMarkup();
  expect(markup).toContain('Back up to Dropbox now');
  expect(markup).toContain('Disconnect');
  expect(markup).toContain('Backing up…');
  expect(markup.match(/disabled=""/g)).toHaveLength(6);
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

test('the Dropbox app section names a custom key by its last four characters', () => {
  view.state = { ...view.state, customAppKey: 'abcde12345' };
  const markup = settingsMarkup();
  expect(markup).toContain('your own app (key ends …2345)');
});
