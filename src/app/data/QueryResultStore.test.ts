import { describe, expect, test, vi } from 'vitest';
import { QueryResultPolicy, QueryResultStore } from './QueryResultStore';

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('QueryResultStore', () => {
  test('keeps a result and reuses it while the data version is unchanged', async () => {
    const store = new QueryResultStore(() => 0);
    expect(store.isStale('a')).toBe(true);
    await store.load('a', async () => 42);
    expect(store.peek('a')).toEqual({ status: 'ready', value: 42 });
    expect(store.isStale('a')).toBe(false);
  });

  test('a newer data version makes results stale; an older one is ignored', async () => {
    const store = new QueryResultStore(() => 0);
    store.noteVersion(3);
    await store.load('a', async () => 'v3');
    store.noteVersion(2);
    expect(store.isStale('a')).toBe(false);
    store.noteVersion(4);
    expect(store.isStale('a')).toBe(true);
    expect(store.peek('a')).toEqual({ status: 'ready', value: 'v3' });
  });

  test('results go stale after the reuse limit, and failures are always retried', async () => {
    let now = 0;
    const store = new QueryResultStore(() => now);
    await store.load('a', async () => 1);
    await store.load('b', () => Promise.reject(new Error('Offline worker')));
    expect(store.peek('b')).toEqual({ status: 'failed', message: 'Offline worker' });
    expect(store.isStale('b')).toBe(true);
    now = QueryResultPolicy.maximumReuseMilliseconds;
    expect(store.isStale('a')).toBe(false);
    now += 1;
    expect(store.isStale('a')).toBe(true);
  });

  test('a synchronous throw becomes a failed state', async () => {
    const store = new QueryResultStore(() => 0);
    await store.load('a', () => {
      throw new Error('Bad arguments');
    });
    expect(store.peek('a')).toEqual({ status: 'failed', message: 'Bad arguments' });
  });

  test('concurrent requests at the same version share one read', async () => {
    const store = new QueryResultStore(() => 0);
    const fetch = vi.fn(async () => 'shared');
    await Promise.all([store.load('a', fetch), store.load('a', fetch)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('a write during a read starts a new read, and the older result never overwrites it', async () => {
    const store = new QueryResultStore(() => 0);
    const slow = deferred<string>();
    const first = store.load('a', () => slow.promise);
    store.noteVersion(1);
    const fetch = vi.fn(async () => 'after write');
    await store.load('a', fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    slow.resolve('before write');
    await first;
    expect(store.peek('a')).toEqual({ status: 'ready', value: 'after write' });
    expect(store.isStale('a')).toBe(false);
  });

  test('a read that started before a write is stale once it lands', async () => {
    const store = new QueryResultStore(() => 0);
    const slow = deferred<string>();
    const loading = store.load('a', () => slow.promise);
    store.noteVersion(1);
    slow.resolve('old');
    await loading;
    expect(store.isStale('a')).toBe(true);
  });

  test('tells watchers when their key settles and stops after unsubscribing', async () => {
    const store = new QueryResultStore(() => 0);
    const watcher = vi.fn();
    const stop = store.watch('a', watcher);
    await store.load('a', async () => 1);
    await store.load('b', async () => 2);
    expect(watcher).toHaveBeenCalledTimes(1);
    stop();
    store.noteVersion(1);
    await store.load('a', async () => 3);
    expect(watcher).toHaveBeenCalledTimes(1);
  });

  test('evicts the least recently used result, but never one a screen is watching', async () => {
    const store = new QueryResultStore(() => 0, 2);
    await store.load('a', async () => 'a');
    await store.load('b', async () => 'b');
    store.watch('a', () => undefined);
    await store.load('c', async () => 'c');
    expect(store.keys()).toEqual(['a', 'c']);
    await store.load('d', async () => 'd');
    expect(store.keys()).toEqual(['a', 'd']);
  });

  test('keeps about fifty results by default', async () => {
    const store = new QueryResultStore(() => 0);
    for (let index = 0; index < QueryResultPolicy.entries + 10; index += 1)
      await store.load(`k${index}`, async () => index);
    expect(store.keys()).toHaveLength(QueryResultPolicy.entries);
    expect(store.peek('k0')).toBeUndefined();
    expect(store.peek(`k${QueryResultPolicy.entries + 9}`)).toEqual({
      status: 'ready',
      value: QueryResultPolicy.entries + 9,
    });
  });
});
