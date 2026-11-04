import { expect, test } from 'vitest';
import { DropboxTokenStore } from './DropboxTokenStore';
import { effectiveDropboxAppKey } from './effectiveDropboxAppKey';

test('saved key takes precedence and clearing it restores the default, including an empty default', () => {
  const values = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  const store = new DropboxTokenStore(() => storage);
  expect(effectiveDropboxAppKey(store, 'default')).toBe('default');
  expect(effectiveDropboxAppKey(store, '')).toBe('');
  store.writeAppKey(' custom ');
  expect(effectiveDropboxAppKey(store, 'default')).toBe('custom');
  store.writeAppKey('');
  expect(effectiveDropboxAppKey(store, 'default')).toBe('default');
});

test('Regression: a saved key of a deleted Dropbox app is ignored, then removed at start-up, so the built-in key is used', () => {
  const values = new Map<string, string>([['workout-tracker.dropbox.app-key', 'jzqiomik3a47qoz']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  } as Storage; // Only the three methods the store calls.
  const store = new DropboxTokenStore(() => storage);
  expect(effectiveDropboxAppKey(store, 'built-in')).toBe('built-in');
  // Reading has no side effect; the clean-up at start-up removes the stored key.
  expect(values.size).toBe(1);
  store.forgetRetiredAppKey();
  expect(values.size).toBe(0);
  expect(effectiveDropboxAppKey(store, 'built-in')).toBe('built-in');
});
