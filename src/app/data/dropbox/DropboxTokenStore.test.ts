import { expect, test, vi } from 'vitest';
import { DropboxTokenStore } from './DropboxTokenStore';

test('uses one key, keeps other storage untouched, and stores only the refresh token', () => {
  const storage = {
    getItem: vi.fn(() => 'refresh'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  };
  const tokens = new DropboxTokenStore(() => storage);
  expect(tokens.read()).toBe('refresh');
  tokens.write('new refresh');
  tokens.clear();
  expect(storage.getItem).toHaveBeenCalledWith('workout-tracker.dropbox.refresh-token');
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith('workout-tracker.dropbox.refresh-token', 'new refresh');
  expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith('workout-tracker.dropbox.refresh-token');
  expect(storage.clear).not.toHaveBeenCalled();
});

test('guards localStorage getter and all operations without leaking the original error', () => {
  const tokens = new DropboxTokenStore(() => {
    throw new Error('sensitive raw error');
  });
  expect(() => tokens.read()).toThrow('could not be read');
  expect(() => tokens.write('secret')).toThrow('could not stay connected');
  expect(() => tokens.clear()).toThrow('could not be removed');
});

function pendingStorage() {
  const entries = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
    key: (index) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  };
  return { storage, tokens: new DropboxTokenStore(() => storage) };
}

test('pending verifier lifetime is bounded and stored separately from refresh credentials', () => {
  const { storage, tokens } = pendingStorage();
  const verifier = 'a'.repeat(43);
  tokens.write('refresh');
  tokens.writePendingVerifier(verifier, 1000, 'appKey');
  expect(new DropboxTokenStore(() => storage).readPendingVerifier(600_999, 'appKey')).toBe(verifier);
  expect(tokens.readPendingVerifier(601_000, 'appKey')).toBeUndefined();
  expect(storage.getItem('workout-tracker.dropbox.pending-verifier')).toBeNull();
  expect(tokens.read()).toBe('refresh');
});

test.each([
  'invalid JSON',
  'null',
  '[]',
  JSON.stringify({ verifier: 'short', createdAt: 1000, appKey: 'appKey' }),
  JSON.stringify({ verifier: 'a'.repeat(43), createdAt: 1001, appKey: 'appKey' }),
  JSON.stringify({ verifier: 'a'.repeat(43), createdAt: '1000', appKey: 'appKey' }),
  JSON.stringify({ verifier: 'a'.repeat(43), createdAt: 1000, appKey: 'otherKey' }),
])('invalid pending entries are removed: %s', (stored) => {
  const { storage, tokens } = pendingStorage();
  storage.setItem('workout-tracker.dropbox.pending-verifier', stored);
  expect(tokens.readPendingVerifier(1000, 'appKey')).toBeUndefined();
  expect(storage.length).toBe(0);
});

test('pending operations surface storage failures without leaking their contents', () => {
  const tokens = new DropboxTokenStore(() => {
    throw new Error('private verifier');
  });
  expect(() => tokens.writePendingVerifier('private verifier', 1000, 'appKey')).toThrow('could not be saved');
  expect(() => tokens.readPendingVerifier(1000, 'appKey')).toThrow('could not be read');
  expect(() => tokens.clearPendingVerifier()).toThrow('could not be cleared');
});
