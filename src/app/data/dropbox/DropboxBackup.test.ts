import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { backupFileName } from '../../../core/backup/BackupFile';
import { log } from '../../../core/support/log';
import type { CloudBackupSettings, CloudBackupSettingsUpdate } from '../../../worker/WorkerApi';
import { BackupError } from '../../../core/backup/BackupError';
import { DropboxError } from './DropboxError';
import { DropboxApi } from './DropboxApi';
import { DropboxBackup } from './DropboxBackup';
import { DropboxTokenStore } from './DropboxTokenStore';
import { verifierChallenge } from './pkce';

const NOW = '2026-10-31T12:00:00.000Z';
const REFRESH = 'synthetic-refresh-token';
const ACCESS = 'synthetic-access-token';

function setup(appKey = 'synthetic-app-key') {
  let clock = Date.parse(NOW);
  const saved = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => {
      saved.set(key, value);
    },
    removeItem: (key) => {
      saved.delete(key);
    },
    clear: () => saved.clear(),
    key: (index) => [...saved.keys()][index] ?? null,
    get length() {
      return saved.size;
    },
  };
  const tokens = new DropboxTokenStore(() => storage);
  let settings: CloudBackupSettings = { provider: null, pending: false, lastCloudBackupAt: undefined };
  let version = 0;
  const bytes = new Uint8Array([83, 81, 76, 105, 116, 101]);
  const database = {
    isDatabaseEmpty: vi.fn(async () => false),
    restoreBackup: vi.fn(async (bytes: Uint8Array) => ({
      snapshotName: 'snapshot.sqlite',
      workoutCount: bytes.byteLength > 0 ? 5 : 0,
    })),
    exportBackup: vi.fn(async () => ({ fileName: backupFileName(new Date(clock)), bytes, changeVersion: version })),
    cloudBackupSettings: vi.fn(async () => settings),
    updateCloudBackupSettings: vi.fn(async (change: CloudBackupSettingsUpdate) => {
      settings = {
        provider: change.provider === undefined ? settings.provider : change.provider,
        pending:
          change.pending === undefined ||
          (change.pending === false &&
            change.completedExportVersion !== undefined &&
            change.completedExportVersion !== version)
            ? settings.pending
            : change.pending,
        lastCloudBackupAt:
          change.lastCloudBackupAt === undefined ? settings.lastCloudBackupAt : (change.lastCloudBackupAt ?? undefined),
      };
      version += 1;
    }),
  };
  const listed = Array.from({ length: 20 }, (_, index) => {
    const timestamp = `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`;
    const name = backupFileName(new Date(timestamp));
    return { '.tag': 'file', name, path_display: `/${name}`, server_modified: timestamp, size: 1024 };
  });
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/oauth2/token'))
      return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
    if (String(url).endsWith('/list_folder')) return Response.json({ entries: listed, has_more: false, cursor: 'end' });
    return Response.json({});
  });
  const api = new DropboxApi(appKey, tokens, request, () => clock);
  const backup = new DropboxBackup(appKey, database, tokens, api, () => new Date(clock));
  const popup = { navigate: vi.fn(), close: vi.fn() };
  return {
    backup,
    api,
    tokens,
    storage,
    database,
    restart: () =>
      new DropboxBackup(
        appKey,
        database,
        tokens,
        new DropboxApi(appKey, tokens, request, () => clock),
        () => new Date(clock),
      ),
    request,
    bytes,
    popup,
    listed,
    settings: () => settings,
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
    connect: async () => {
      await backup.beginConnect(() => popup);
      await backup.finishConnecting(' pasted-code ');
    },
  };
}

beforeEach(() => {
  vi.spyOn(log.backup, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Dropbox connection and backup orchestration', () => {
  test('empty configured key disables all storage, database, browser, and network actions', async () => {
    const { backup, request, database, popup } = setup('');
    const open = vi.fn(() => popup);
    await backup.initialize();
    await backup.beginConnect(open);
    await backup.beginRedirectConnect('https://example.com/settings', popup.navigate);
    await backup.finishConnecting('code');
    await backup.backUp();
    await backup.afterWorkout();
    await backup.retryPending();
    await backup.disconnect();
    expect(backup.snapshot().enabled).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(popup.navigate).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(database.cloudBackupSettings).not.toHaveBeenCalled();
    expect(database.exportBackup).not.toHaveBeenCalled();
  });

  test('connect exchanges a pasted code with the same pending verifier, and immediately uploads', async () => {
    const { backup, popup, connect, request, storage, database, bytes, settings } = setup();
    await connect();
    const authorization = new URL(String(popup.navigate.mock.calls[0]?.[0]));
    const tokenCall = request.mock.calls.find(([url]) => String(url).endsWith('/oauth2/token'));
    const parameters = new URLSearchParams(String(tokenCall?.[1]?.body));
    expect(parameters.get('code')).toBe('pasted-code');
    expect(parameters.get('grant_type')).toBe('authorization_code');
    expect(parameters.has('client_secret')).toBe(false);
    expect(parameters.has('redirect_uri')).toBe(false);
    expect(await verifierChallenge(parameters.get('code_verifier') ?? '')).toBe(
      authorization.searchParams.get('code_challenge'),
    );
    expect(storage.length).toBe(1);
    expect(storage.getItem('workout-tracker.dropbox.refresh-token')).toBe(REFRESH);
    expect(JSON.stringify(settings())).not.toContain(REFRESH);
    const uploadCall = request.mock.calls.find(([url]) => String(url).endsWith('/upload'));
    expect(uploadCall?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${ACCESS}`,
      'Dropbox-API-Arg': JSON.stringify({
        path: '/WorkoutTracker-2026-10-31T12-00-00.sqlite',
        mode: 'add',
        autorename: false,
        mute: true,
      }),
    });
    expect(uploadCall?.[1]?.body).toEqual(bytes.buffer);
    expect(database.exportBackup).toHaveBeenCalledOnce();
    expect(settings()).toEqual({ provider: 'dropbox', pending: false, lastCloudBackupAt: NOW });
    expect(backup.snapshot()).toMatchObject({
      connected: true,
      awaitingCode: false,
      phase: 'idle',
      message: undefined,
      notice: 'Connected. First backup saved to your Dropbox (Apps folder).',
    });
  });

  test('opens the tab synchronously before crypto completes and gives blocked popups a readable failure', async () => {
    const { backup, popup } = setup();
    const open = vi.fn(() => popup);
    const connecting = backup.beginConnect(open);
    expect(open).toHaveBeenCalledOnce();
    await connecting;
    expect(backup.snapshot().awaitingCode).toBe(true);
    await backup.beginConnect(() => null);
    expect(backup.snapshot().message).toContain('Allow a new tab');
  });

  test('failed code exchanges require a fresh Connect and never persist rejected credentials', async () => {
    const { backup, request, storage, popup } = setup();
    request.mockResolvedValue(Response.json({ error: 'invalid_grant', error_description: ACCESS }, { status: 400 }));
    await backup.beginConnect(() => popup);
    await backup.finishConnecting('expired');
    expect(backup.snapshot()).toMatchObject({ connected: false, awaitingCode: false });
    expect(backup.snapshot().message).toBe(
      "Dropbox didn't accept that code. Codes work once and expire after a few minutes. Tap Open Dropbox for a new one.",
    );
    expect(backup.snapshot().codeMessage).toBe(backup.snapshot().message);
    expect(storage.length).toBe(0);
    expect(JSON.stringify(vi.mocked(log.backup.error).mock.calls)).not.toContain(ACCESS);
    request.mockClear();
    await backup.finishConnecting('reuse');
    expect(request).not.toHaveBeenCalled();
  });

  test('persists the verifier before navigating and restores it after a restart to upload exactly once', async () => {
    const { backup, tokens, popup, restart, request, database } = setup();
    const navigate = vi.fn((url: string) => {
      expect(tokens.readPendingVerifier(Date.parse(NOW), 'synthetic-app-key')).toBeDefined();
      popup.navigate(url);
    });
    await backup.beginConnect(() => ({ navigate, close: popup.close }));
    const verifier = tokens.readPendingVerifier(Date.parse(NOW), 'synthetic-app-key');
    const resumed = restart();
    await resumed.initialize();
    expect(resumed.snapshot()).toMatchObject({ awaitingCode: true, connected: false });
    await resumed.finishConnecting('resumed-code');
    const parameters = new URLSearchParams(String(request.mock.calls[0]?.[1]?.body));
    expect(parameters.get('code_verifier')).toBe(verifier);
    expect(tokens.readPendingVerifier(Date.parse(NOW), 'synthetic-app-key')).toBeUndefined();
    expect(database.exportBackup).toHaveBeenCalledOnce();
    expect(resumed.snapshot().notice).toBe('Connected. First backup saved to your Dropbox (Apps folder).');
  });

  test('a pending verifier expires at ten minutes both after restart and in the open app', async () => {
    const { backup, popup, tokens, storage, advance, restart, request } = setup();
    await backup.beginConnect(() => popup);
    advance(599_999);
    expect(tokens.readPendingVerifier(Date.parse(NOW) + 599_999, 'synthetic-app-key')).toBeDefined();
    advance(1);
    const resumed = restart();
    await resumed.initialize();
    expect(resumed.snapshot().awaitingCode).toBe(false);
    expect(storage.length).toBe(0);
    await backup.finishConnecting('old-code');
    expect(backup.snapshot().codeMessage).toBe('Tap Open Dropbox first, then paste the new code.');
    expect(request).not.toHaveBeenCalled();
  });

  test('disconnect and a changed key clear a pending grant without making token requests', async () => {
    const { backup, popup, tokens, request } = setup();
    await backup.beginConnect(() => popup);
    await backup.disconnect();
    expect(tokens.readPendingVerifier(Date.parse(NOW), 'synthetic-app-key')).toBeUndefined();
    await backup.beginConnect(() => popup);
    await backup.saveAppKey('changedKey');
    expect(tokens.readPendingVerifier(Date.parse(NOW), 'synthetic-app-key')).toBeUndefined();
    expect(backup.snapshot().awaitingCode).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  test('a missing step and an offline exchange answer under the field without logging code or verifier', async () => {
    const { backup, popup, tokens, request } = setup();
    await backup.finishConnecting('private-code');
    expect(backup.snapshot().codeMessage).toBe('Tap Open Dropbox first, then paste the new code.');
    expect(request).not.toHaveBeenCalled();
    await backup.beginConnect(() => popup);
    const verifier = tokens.readPendingVerifier(Date.parse(NOW), 'synthetic-app-key');
    request.mockRejectedValue(new Error('private-code'));
    vi.stubGlobal('navigator', { onLine: false });
    await backup.finishConnecting('private-code');
    expect(backup.snapshot().codeMessage).toBe("No connection. Try again when you're online.");
    const logs = JSON.stringify(vi.mocked(log.backup.error).mock.calls);
    expect(logs).not.toContain('private-code');
    expect(logs).not.toContain(verifier);
  });

  test('empty codes leave the pending step available', async () => {
    const { backup, popup, tokens, request } = setup();
    await backup.beginConnect(() => popup);
    await backup.finishConnecting('  ');
    expect(backup.snapshot().codeMessage).toBe('Paste the code Dropbox shows, then tap Connect.');
    expect(tokens.readPendingVerifier(Date.parse(NOW), 'synthetic-app-key')).toBeDefined();
    expect(request).not.toHaveBeenCalled();
  });

  test('key saves answer for new, same, blank and malformed values without disrupting an unchanged grant', async () => {
    const { backup, popup, tokens, request } = setup();
    await backup.saveAppKey('validKey');
    expect(backup.snapshot().appKeyMessage).toBe('Saved. Tap Open Dropbox to connect with it.');
    await backup.beginConnect(() => popup);
    await backup.saveAppKey(' validKey ');
    expect(backup.snapshot().appKeyMessage).toBe('That key is already in use.');
    expect(tokens.readPendingVerifier(Date.parse(NOW), 'validKey')).toBeDefined();
    for (const key of ['abcd', 'a'.repeat(41), 'wrong-key', 'key with spaces']) {
      await backup.saveAppKey(key);
      expect(backup.snapshot().appKeyMessage).toBe("That doesn't look like a Dropbox app key.");
      expect(backup.snapshot().appKeyInvalid).toBe(true);
      expect(tokens.readAppKey()).toBe('validKey');
      expect(backup.snapshot().awaitingCode).toBe(true);
    }
    await backup.saveAppKey('   ');
    expect(backup.snapshot().appKeyMessage).toBe("Using JEM's built-in key.");
    expect(tokens.readAppKey()).toBeUndefined();
    expect(backup.snapshot().awaitingCode).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  test.each(['a'.repeat(5), 'B'.repeat(40)])('key validation accepts boundary length: %s', async (key) => {
    const { backup, tokens } = setup();
    await backup.saveAppKey(key);
    expect(tokens.readAppKey()).toBe(key);
    expect(backup.snapshot().appKeyInvalid).toBe(false);
  });

  test('a pending-step storage failure closes the popup and surfaces a safe error before navigation', async () => {
    const { backup, storage, popup } = setup();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('private-storage-details');
    });
    await backup.beginConnect(() => popup);
    expect(popup.navigate).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalledOnce();
    expect(backup.snapshot()).toMatchObject({
      awaitingCode: false,
      message: expect.stringContaining('could not be saved'),
    });
    expect(JSON.stringify(vi.mocked(log.backup.error).mock.calls)).not.toContain('private-storage-details');
  });

  test('saving the built-in key or blank again preserves a pending step and returns the matching feedback', async () => {
    const { backup, popup, tokens } = setup('');
    await backup.saveAppKey('');
    await backup.beginConnect(() => popup);
    const authorization = new URL(String(popup.navigate.mock.lastCall?.[0]));
    const selectedKey = authorization.searchParams.get('client_id') ?? '';
    await backup.saveAppKey('');
    expect(backup.snapshot().appKeyMessage).toBe("Using JEM's built-in key.");
    expect(tokens.readPendingVerifier(Date.parse(NOW), selectedKey)).toBeDefined();
    await backup.saveAppKey(selectedKey);
    expect(backup.snapshot().appKeyMessage).toBe('That key is already in use.');
    expect(backup.snapshot().awaitingCode).toBe(true);
  });

  test('refreshes an expired access token, using only client_id and the stored refresh token', async () => {
    const { connect, backup, request, advance } = setup();
    await connect();
    request.mockClear();
    advance(3_600_000);
    await backup.backUp();
    const parameters = new URLSearchParams(String(request.mock.calls[0]?.[1]?.body));
    expect(Object.fromEntries(parameters)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: 'synthetic-app-key',
    });
    expect(request.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: `Bearer ${ACCESS}` });
  });

  test('reuses an unexpired token without persisting it', async () => {
    const { connect, backup, request, storage } = setup();
    await connect();
    request.mockClear();
    await backup.backUp();
    expect(request.mock.calls.some(([url]) => String(url).endsWith('/oauth2/token'))).toBe(false);
    expect(storage.length).toBe(1);
  });

  test('uploads before listing or deleting, and prunes only retention-selected app backups', async () => {
    const { connect, request, listed } = setup();
    await connect();
    const paths = request.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths.slice(0, 3)).toEqual(['/oauth2/token', '/2/files/upload', '/2/files/list_folder']);
    const deleted = request.mock.calls.filter(([url]) => String(url).endsWith('/delete_v2'));
    expect(deleted.map(([, options]) => JSON.parse(String(options?.body)))).toEqual(
      listed.slice(1, 6).map((entry) => ({ path: entry.path_display })),
    );
  });

  test('failed upload leaves a pending retry and never lists or deletes anything', async () => {
    const { backup, connect, request, settings } = setup();
    request.mockImplementation(async (url) =>
      String(url).endsWith('/oauth2/token')
        ? Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 })
        : Response.json({ error_summary: 'sensitive-response' }, { status: 409 }),
    );
    await connect();
    expect(request).toHaveBeenCalledTimes(2);
    expect(settings()).toMatchObject({ pending: true, lastCloudBackupAt: undefined });
    expect(backup.snapshot().message).toContain('Dropbox could not save');
    expect(log.backup.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(log.backup.error).mock.calls)).not.toContain('sensitive-response');
  });

  test('retention failure still records the successful upload, and leaves a pending retry', async () => {
    const { connect, backup, request, settings } = setup();
    request.mockImplementation(async (url) => {
      if (String(url).endsWith('/oauth2/token'))
        return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
      return Response.json({}, { status: String(url).endsWith('/list_folder') ? 503 : 200 });
    });
    await connect();
    expect(settings()).toMatchObject({ pending: true, lastCloudBackupAt: NOW });
    expect(backup.snapshot().message).toContain('could not finish');
  });

  test('revoked refresh tokens clear the connection and request reconnection without logging tokens', async () => {
    const { backup, tokens, request, settings } = setup();
    tokens.write(REFRESH);
    await backup.initialize();
    request.mockResolvedValue(Response.json({ error: 'invalid_grant', error_description: REFRESH }, { status: 400 }));
    await backup.backUp();
    expect(tokens.read()).toBeUndefined();
    expect(settings()).toMatchObject({ provider: null, pending: true });
    expect(backup.snapshot()).toMatchObject({
      connected: false,
      reconnect: true,
      message: 'Reconnect Dropbox to continue automatic backups.',
    });
    expect(JSON.stringify(vi.mocked(log.backup.error).mock.calls)).not.toContain(REFRESH);
    expect(request).toHaveBeenCalledOnce();
  });

  test('temporary refresh failure keeps credentials for a later retry', async () => {
    const { backup, tokens, request } = setup();
    tokens.write(REFRESH);
    await backup.initialize();
    request.mockResolvedValue(Response.json({ error: 'temporarily_unavailable' }, { status: 503 }));
    await backup.backUp();
    expect(tokens.read()).toBe(REFRESH);
    expect(backup.snapshot().connected).toBe(true);
  });

  test('pending work resumes on app open, and online retries are quiet when nothing is pending', async () => {
    const { backup, tokens, database, request, settings } = setup();
    tokens.write(REFRESH);
    await database.updateCloudBackupSettings({ provider: 'dropbox', pending: true });
    await backup.initialize();
    expect(database.exportBackup).toHaveBeenCalledOnce();
    expect(settings().pending).toBe(false);
    request.mockClear();
    await backup.retryPending();
    expect(request).not.toHaveBeenCalled();
    await database.updateCloudBackupSettings({ pending: true });
    await backup.retryPending();
    expect(database.exportBackup).toHaveBeenCalledTimes(2);
  });

  test('a restored database without this phone’s token never uploads; it offers reconnect for pending work', async () => {
    const { backup, database, request } = setup();
    await database.updateCloudBackupSettings({ provider: 'dropbox', pending: true });
    await backup.initialize();
    await backup.retryPending();
    await backup.afterWorkout();
    expect(backup.snapshot()).toMatchObject({ connected: false, reconnect: true });
    expect(request).not.toHaveBeenCalled();
  });

  test('disconnect revokes and clears local state without deleting Dropbox files', async () => {
    const { connect, backup, tokens, request, settings } = setup();
    await connect();
    request.mockClear();
    await backup.disconnect();
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'https://api.dropboxapi.com/2/auth/token/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(tokens.read()).toBeUndefined();
    expect(settings()).toEqual({ provider: null, pending: false, lastCloudBackupAt: undefined });
    expect(backup.snapshot()).toMatchObject({ connected: false, message: undefined });
  });

  test('offline disconnect retains credentials so revocation can be retried', async () => {
    const { connect, backup, tokens, request } = setup();
    await connect();
    request.mockRejectedValue(new Error(ACCESS));
    vi.stubGlobal('navigator', { onLine: false });
    await backup.disconnect();
    expect(tokens.read()).toBe(REFRESH);
    expect(backup.snapshot()).toMatchObject({
      connected: true,
      message: "No connection. Try again when you're online.",
    });
    expect(JSON.stringify(vi.mocked(log.backup.error).mock.calls)).not.toContain(ACCESS);
  });

  test('changing the key revokes using the old key before saving and requires a new connection', async () => {
    const { connect, backup, tokens, request, advance, popup } = setup();
    await connect();
    advance(3_600_000);
    request.mockClear();
    await backup.saveAppKey('  anotherKey  ');
    const refresh = new URLSearchParams(String(request.mock.calls[0]?.[1]?.body));
    expect(refresh.get('client_id')).toBe('synthetic-app-key');
    expect(String(request.mock.calls[1]?.[0])).toContain('/token/revoke');
    expect(tokens.read()).toBeUndefined();
    expect(tokens.readAppKey()).toBe('anotherKey');
    expect(backup.snapshot()).toMatchObject({ connected: false, enabled: true });
    await backup.beginConnect(() => popup);
    expect(new URL(String(popup.navigate.mock.lastCall?.[0])).searchParams.get('client_id')).toBe('anotherKey');
  });

  test('failed revocation preserves the original key and connection', async () => {
    const { connect, backup, tokens, request } = setup();
    await connect();
    request.mockRejectedValue(new Error('offline'));
    vi.stubGlobal('navigator', { onLine: false });
    await backup.saveAppKey('anotherKey');
    expect(tokens.readAppKey()).toBeUndefined();
    expect(tokens.read()).toBe(REFRESH);
    expect(backup.snapshot()).toMatchObject({ connected: true, message: expect.stringContaining('No connection') });
  });

  test('saving a key enables a previously disabled coordinator', async () => {
    const { backup, tokens } = setup('');
    await backup.saveAppKey('newKey');
    expect(tokens.readAppKey()).toBe('newKey');
    expect(backup.snapshot().enabled).toBe(true);
  });

  test('backup failures are published to subscribers and unsubscribed views stop receiving changes', async () => {
    const { backup, tokens, request } = setup();
    tokens.write(REFRESH);
    await backup.initialize();
    const listener = vi.fn();
    const unsubscribe = backup.subscribe(listener);
    request.mockRejectedValue(new Error('offline'));
    await backup.afterWorkout();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await backup.retryPending();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('Dropbox redirect connection', () => {
  const redirectUri = 'https://example.com/workout-tracker/settings';

  async function redirectSetup() {
    const context = setup();
    const navigate = vi.fn();
    await context.backup.beginRedirectConnect(redirectUri, navigate);
    const authorization = new URL(String(navigate.mock.calls[0]?.[0]));
    const state = authorization.searchParams.get('state') ?? '';
    const callback = new URL(redirectUri);
    callback.search = new URLSearchParams({ code: 'returned-code', state }).toString();
    return { ...context, navigate, authorization, callback, state };
  }

  test('both pending secrets are stored before navigation can leave the app', async () => {
    const { backup, tokens } = setup();
    const navigate = vi.fn((url: string) => {
      const authorization = new URL(url);
      const pending = tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key');
      expect(pending?.state).toBe(authorization.searchParams.get('state'));
      expect(pending?.verifier).toBeDefined();
    });
    await backup.beginRedirectConnect(redirectUri, navigate);
    expect(navigate).toHaveBeenCalledOnce();
  });

  test('persists state before same-window navigation and exchanges once after restart with the same redirect URI', async () => {
    const { backup, authorization, callback, tokens, restart, request, database, state } = await redirectSetup();
    const pending = tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key');
    expect(pending?.state).toBe(state);
    expect(backup.snapshot().awaitingCode).toBe(false);
    expect(authorization.searchParams.get('redirect_uri')).toBe(redirectUri);
    callback.searchParams.set('credits', '1');
    callback.hash = '#backup';
    const resumed = restart();
    let address = callback.href;
    const replace = vi.fn((url: string) => {
      address = new URL(url, redirectUri).href;
    });
    const connecting = resumed.handleRedirect(redirectUri, address, replace);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/workout-tracker/settings?credits=1#backup');
    expect(request).not.toHaveBeenCalled();
    // The singleton queues initialization after handling the callback.
    const initializing = resumed.initialize();
    await connecting;
    await initializing;
    const tokenCalls = request.mock.calls.filter(([url]) => String(url).endsWith('/oauth2/token'));
    expect(tokenCalls).toHaveLength(1);
    const parameters = new URLSearchParams(String(tokenCalls[0]?.[1]?.body));
    expect(parameters.get('redirect_uri')).toBe(authorization.searchParams.get('redirect_uri'));
    expect(parameters.get('code')).toBe('returned-code');
    expect(parameters.get('code_verifier')).toBe(pending?.verifier);
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/upload'))).toHaveLength(1);
    expect(database.exportBackup).toHaveBeenCalledOnce();
    expect(tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key')).toBeUndefined();
    expect(resumed.snapshot().notice).toBe('Connected. First backup saved to your Dropbox (Apps folder).');
    const reloaded = restart();
    await reloaded.handleRedirect(redirectUri, address, replace);
    await reloaded.initialize();
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/oauth2/token'))).toHaveLength(1);
    expect(database.exportBackup).toHaveBeenCalledOnce();
    expect(reloaded.snapshot().connected).toBe(true);
  });

  test.each(['mismatched', 'missing', 'empty'])(
    '%s state rejects the reply without exchanging or logging secrets',
    async (kind) => {
      const { callback, restart, request, database, tokens, state } = await redirectSetup();
      const verifier = tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key')?.verifier;
      if (kind === 'missing') callback.searchParams.delete('state');
      else callback.searchParams.set('state', kind === 'empty' ? '' : 'wrong-state');
      const resumed = restart();
      const replace = vi.fn();
      await resumed.handleRedirect(redirectUri, callback.href, replace);
      await resumed.initialize();
      expect(resumed.snapshot().message).toBe("That Dropbox reply didn't match this phone. Tap Open Dropbox again.");
      expect(replace).toHaveBeenCalledExactlyOnceWith('/workout-tracker/settings');
      expect(request).not.toHaveBeenCalled();
      expect(database.exportBackup).not.toHaveBeenCalled();
      const logs = JSON.stringify(vi.mocked(log.backup.error).mock.calls);
      for (const secret of ['returned-code', 'wrong-state', state, verifier ?? 'private-verifier']) {
        expect(logs).not.toContain(secret);
      }
    },
  );

  test('expired redirect grant says the step expired and clears the query', async () => {
    const { callback, advance, restart, request, tokens } = await redirectSetup();
    advance(600_000);
    const resumed = restart();
    const replace = vi.fn();
    await resumed.handleRedirect(redirectUri, callback.href, replace);
    await resumed.initialize();
    expect(resumed.snapshot().message).toBe('That Dropbox step expired or was already used. Tap Open Dropbox again.');
    expect(replace).toHaveBeenCalledExactlyOnceWith('/workout-tracker/settings');
    expect(tokens.readPendingVerifier(Date.parse(NOW) + 600_000, 'synthetic-app-key')).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    ['access_denied', "Dropbox access wasn't allowed."],
    ['server_error', 'Dropbox could not finish connecting. Tap Open Dropbox again.'],
  ])('Dropbox error %s gives safe feedback and removes error details', async (error, message) => {
    const { callback, restart, request, tokens } = await redirectSetup();
    callback.searchParams.delete('code');
    callback.searchParams.delete('state');
    callback.searchParams.set('error', error);
    callback.searchParams.set('error_description', 'private-response');
    callback.searchParams.set('error_uri', 'https://example.com/private-response');
    const resumed = restart();
    const replace = vi.fn();
    await resumed.handleRedirect(redirectUri, callback.href, replace);
    expect(resumed.snapshot().message).toBe(message);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/workout-tracker/settings');
    expect(tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key')?.verifier).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(log.backup.error).mock.calls)).not.toContain('private-response');
  });

  test('does not read or change other routes or a Settings URL without an OAuth reply', async () => {
    const { backup, request, tokens } = setup();
    const read = vi.spyOn(tokens, 'readPendingAuthorization');
    const replace = vi.fn();
    await backup.handleRedirect(redirectUri, 'https://example.com/workout-tracker/history?code=unrelated', replace);
    await backup.handleRedirect(redirectUri, `${redirectUri}?credits=1`, replace);
    expect(replace).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  test('switching to the copy-code flow replaces the redirect grant and still omits redirect_uri', async () => {
    const { backup, popup, tokens, request } = await redirectSetup();
    await backup.finishConnecting('wrong-flow');
    expect(request).not.toHaveBeenCalled();
    await backup.beginConnect(() => popup);
    const authorization = new URL(String(popup.navigate.mock.lastCall?.[0]));
    expect(authorization.searchParams.has('redirect_uri')).toBe(false);
    expect(authorization.searchParams.has('state')).toBe(false);
    expect(tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key')?.state).toBeUndefined();
    await backup.finishConnecting('pasted-code');
    const parameters = new URLSearchParams(String(request.mock.calls[0]?.[1]?.body));
    expect(parameters.has('redirect_uri')).toBe(false);
    expect(backup.snapshot().connected).toBe(true);
  });

  test('failed redirect exchanges consume the grant and never leak callback secrets', async () => {
    const { callback, restart, request, tokens, state } = await redirectSetup();
    const verifier = tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key')?.verifier;
    request.mockResolvedValue(Response.json({ error: 'invalid_grant', error_description: state }, { status: 400 }));
    const resumed = restart();
    await resumed.handleRedirect(redirectUri, callback.href, vi.fn());
    expect(resumed.snapshot()).toMatchObject({ connected: false, awaitingCode: false, notice: undefined });
    expect(tokens.readPendingAuthorization(Date.parse(NOW), 'synthetic-app-key')?.verifier).toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
    const logs = JSON.stringify(vi.mocked(log.backup.error).mock.calls);
    for (const secret of ['returned-code', state, verifier ?? 'private-verifier']) {
      expect(logs).not.toContain(secret);
    }
  });

  test('storage failure prevents redirect navigation and gives a readable failure', async () => {
    const { backup, storage } = setup();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('private-storage-details');
    });
    const navigate = vi.fn();
    await backup.beginRedirectConnect(redirectUri, navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(backup.snapshot().message).toContain('could not be saved');
    expect(JSON.stringify(vi.mocked(log.backup.error).mock.calls)).not.toContain('private-storage-details');
  });

  test('startup preserves a first-backup failure without immediately uploading again or claiming success', async () => {
    const { callback, restart, request, database, settings } = await redirectSetup();
    request.mockImplementation(async (url) =>
      String(url).endsWith('/oauth2/token')
        ? Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 })
        : Response.json({}, { status: 409 }),
    );
    const resumed = restart();
    const connecting = resumed.handleRedirect(redirectUri, callback.href, vi.fn());
    const initializing = resumed.initialize();
    await connecting;
    await initializing;
    expect(request).toHaveBeenCalledTimes(2);
    expect(database.exportBackup).toHaveBeenCalledOnce();
    expect(settings().pending).toBe(true);
    expect(resumed.snapshot().notice).toBeUndefined();
    expect(resumed.snapshot().message).toContain('Dropbox could not save');
  });
});

describe('Dropbox HTTP response handling', () => {
  test('follows list-folder pagination and excludes folders/deleted entries', async () => {
    const { api, tokens, request, listed } = setup();
    tokens.write(REFRESH);
    request
      .mockResolvedValueOnce(Response.json({ access_token: ACCESS, expires_in: 3600 }))
      .mockResolvedValueOnce(
        Response.json({ entries: [listed[0], { '.tag': 'folder', name: 'folder' }], has_more: true, cursor: 'next' }),
      )
      .mockResolvedValueOnce(
        Response.json({ entries: [listed[1], { '.tag': 'deleted', name: 'removed' }], has_more: false, cursor: 'end' }),
      );
    expect(await api.list()).toEqual(
      listed.slice(0, 2).map((entry) => ({
        name: entry.name,
        path: entry.path_display,
        serverTime: entry.server_modified,
        size: entry.size,
      })),
    );
    expect(request.mock.calls[2]?.[0]).toBe('https://api.dropboxapi.com/2/files/list_folder/continue');
    expect(request.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ cursor: 'next' }));
  });

  test('unreadable or incomplete listings abort retention rather than deleting from a partial list', async () => {
    const { connect, request, backup } = setup();
    request
      .mockResolvedValueOnce(Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ entries: [], has_more: true }));
    await connect();
    expect(backup.snapshot().message).toContain('incomplete file list');
    expect(request).toHaveBeenCalledTimes(3);
  });

  test('401 refreshes and retries the failed request once; a second rejection clears the grant', async () => {
    const { api, connect, request, tokens } = setup();
    await connect();
    request.mockClear();
    request
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: 'new-access', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({}));
    await api.upload('backup.sqlite', new Uint8Array());
    expect(request.mock.calls[2]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer new-access' });
    request.mockClear();
    request
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: 'new-access', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(api.upload('backup.sqlite', new Uint8Array())).rejects.toMatchObject({ kind: 'revoked' });
    expect(tokens.read()).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(3);
  });

  test('malformed successful credentials never become a stored connection', async () => {
    const { api, tokens, request } = setup();
    request.mockResolvedValue(Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 'bad' }));
    await expect(api.exchange('code', 'verifier')).rejects.toThrow('unreadable credentials');
    expect(tokens.read()).toBeUndefined();
  });
});

describe('Dropbox restore discovery and empty-phone protection', () => {
  test('empty connect opens restore choices without export, upload or retention; automatic retries skip too', async () => {
    const { backup, database, request, connect, settings } = setup();
    database.isDatabaseEmpty.mockResolvedValue(true);
    await connect();
    expect(backup.snapshot()).toMatchObject({ connected: true, restoreOpen: true, phase: 'idle' });
    expect(backup.snapshot().backups).toHaveLength(20);
    expect(settings().pending).toBe(false);
    await backup.afterWorkout();
    await database.updateCloudBackupSettings({ pending: true });
    await backup.retryPending();
    await backup.backUp();
    await backup.initialize();
    expect(database.exportBackup).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([url]) => /upload|delete_v2/.test(String(url)))).toBe(false);
  });

  test('empty connect with no valid backups stays connected without opening discovery or uploading', async () => {
    const { backup, database, connect, listed } = setup();
    database.isDatabaseEmpty.mockResolvedValue(true);
    listed.splice(0);
    await connect();
    expect(backup.snapshot()).toMatchObject({ connected: true, restoreOpen: false, backups: [] });
    expect(database.exportBackup).not.toHaveBeenCalled();
  });

  test('download starts only after restore is requested, forwards bytes, and reports progress and the shared success text', async () => {
    const { backup, database, connect, api, bytes } = setup();
    await connect();
    const download = vi.spyOn(api, 'download').mockResolvedValue(bytes);
    await backup.openRestore();
    expect(download).not.toHaveBeenCalled();
    const selected = backup.snapshot().backups?.[0];
    if (selected === undefined) throw new Error('Expected synthetic backup');
    const phases: string[] = [];
    const unsubscribe = backup.subscribe(() => phases.push(backup.snapshot().phase));
    await backup.restore(selected.path);
    unsubscribe();
    expect(download).toHaveBeenCalledExactlyOnceWith(selected.path);
    expect(database.restoreBackup).toHaveBeenCalledExactlyOnceWith(bytes);
    expect(phases).toContain('downloading');
    expect(phases).toContain('restoring');
    expect(backup.snapshot().notice).toBe(
      'Restored 5 workouts. Your previous data is kept as a safety snapshot on this phone.',
    );
    backup.closeRestore();
    expect(backup.snapshot().restoreOpen).toBe(false);
  });

  test('download failure leaves the worker untouched and does not schedule an automatic retry', async () => {
    const { backup, database, connect, api, settings } = setup();
    await connect();
    await backup.openRestore();
    const selected = backup.snapshot().backups?.[0];
    if (selected === undefined) throw new Error('Expected synthetic backup');
    vi.spyOn(api, 'download').mockRejectedValue(new DropboxError('connection', 'Download failed.'));
    await backup.restore(selected.path);
    expect(database.restoreBackup).not.toHaveBeenCalled();
    expect(backup.snapshot().message).toBe('Download failed.');
    expect(settings().pending).toBe(false);
  });

  test('rejects arbitrary download paths and keeps errors from validation owner-readable', async () => {
    const { backup, database, connect, api } = setup();
    await connect();
    const download = vi.spyOn(api, 'download').mockResolvedValue(new Uint8Array());
    await backup.restore('/unlisted.sqlite');
    expect(download).not.toHaveBeenCalled();
    expect(backup.snapshot().message).toContain('Choose a backup');
    await backup.openRestore();
    const selected = backup.snapshot().backups?.[0];
    if (selected === undefined) throw new Error('Expected synthetic backup');
    database.restoreBackup.mockRejectedValue(
      new BackupError('notABackup', 'This is not a backup. Nothing was changed.'),
    );
    await backup.restore(selected.path);
    expect(backup.snapshot().message).toBe('This is not a backup. Nothing was changed.');
  });

  test('invalid_client from authorize shows the disabled-app instruction and online events do not retry', async () => {
    const { backup, request, tokens, settings } = setup();
    tokens.write(REFRESH);
    await backup.handleRedirect(
      'https://example.com/settings',
      'https://example.com/settings?error=invalid_client',
      vi.fn(),
    );
    expect(backup.snapshot().message).toBe(
      'This Dropbox app is switched off. Create a new one in Advanced, or update JEM.',
    );
    expect(settings().pending).toBe(false);
    await backup.retryPending();
    expect(request).not.toHaveBeenCalled();
  });
});
