import { afterEach, expect, test, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  enabled: true,
  initialize: vi.fn(async () => undefined),
  retryPending: vi.fn(async () => undefined),
}));
vi.mock('./effectiveDropboxAppKey', () => ({ effectiveDropboxAppKey: () => 'key' }));
vi.mock('../database', () => ({ database: {} }));
vi.mock('./DropboxBackup', () => ({
  DropboxBackup: class {
    snapshot = () => ({ enabled: calls.enabled });
    initialize = calls.initialize;
    retryPending = calls.retryPending;
  },
}));

// This tests only app-lifetime event wiring. The real coordinator and HTTP client are tested separately.
afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function browserAt(url = 'http://localhost:5173/settings') {
  return Object.assign(new EventTarget(), {
    location: new URL(url),
    history: { state: { synthetic: true }, replaceState: vi.fn() },
  });
}

test('enabled runtime initializes once and forwards online events without a mounted screen', async () => {
  calls.enabled = true;
  const browser = browserAt();
  vi.stubGlobal('window', browser);
  await import('./cloudBackup');
  expect(calls.initialize).toHaveBeenCalledOnce();
  browser.dispatchEvent(new Event('online'));
  expect(calls.retryPending).toHaveBeenCalledOnce();
});

test('disabled runtime retains startup and online wiring for a key added later', async () => {
  calls.enabled = false;
  const browser = browserAt();
  vi.stubGlobal('window', browser);
  await import('./cloudBackup');
  browser.dispatchEvent(new Event('online'));
  expect(calls.initialize).toHaveBeenCalledOnce();
  expect(calls.retryPending).toHaveBeenCalledOnce();
});
