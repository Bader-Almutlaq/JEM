import { describe, expect, test, vi } from 'vitest';
import { Database } from './Database';
import { migrate } from './migrations';
import { QueryCache } from './QueryCache';

describe('QueryCache', () => {
  test('computes once per name and arguments at one version', () => {
    const cache = new QueryCache(() => 0);
    const compute = vi.fn(() => ({ total: 3 }));
    const first = cache.get('total', [1, 'a'], compute);
    expect(cache.get('total', [1, 'a'], compute)).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(cache.statistics()).toEqual({ hits: 1, misses: 1, entries: 1 });
  });

  test('keeps undefined, null, numbers, strings and booleans apart', () => {
    const cache = new QueryCache(() => 0);
    const parts = [[undefined], [null], [1], ['1'], [true], ['true'], ['a,b'], ['a', 'b']] as const;
    parts.forEach((key, index) => cache.get('q', key, () => index));
    expect(parts.map((key) => cache.get('q', key, () => -1))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(cache.get('other', [undefined], () => 'separate name')).toBe('separate name');
  });

  test('drops every result when the version moves', () => {
    let version = 0;
    const cache = new QueryCache(() => version);
    cache.get('q', [], () => 'old');
    version = 1;
    expect(cache.get('q', [], () => 'new')).toBe('new');
    expect(cache.statistics().entries).toBe(1);
  });

  test('does not keep a value whose computation wrote', () => {
    let version = 0;
    const cache = new QueryCache(() => version);
    expect(
      cache.get('q', [], () => {
        version += 1;
        return 'mixed';
      }),
    ).toBe('mixed');
    expect(cache.get('q', [], () => 'fresh')).toBe('fresh');
  });

  test('does not keep a failure', () => {
    const cache = new QueryCache(() => 0);
    expect(() =>
      cache.get('q', [], () => {
        throw new Error('broken');
      }),
    ).toThrow('broken');
    expect(cache.get('q', [], () => 'recovered')).toBe('recovered');
  });

  test('evicts the least recently used result beyond capacity', () => {
    const cache = new QueryCache(() => 0, 2);
    cache.get('q', [1], () => 'one');
    cache.get('q', [2], () => 'two');
    cache.get('q', [1], () => 'unused');
    cache.get('q', [3], () => 'three');
    expect(cache.get('q', [1], () => 'recomputed')).toBe('one');
    expect(cache.get('q', [2], () => 'recomputed')).toBe('recomputed');
  });

  test('nested reads share the version and both stay cached', () => {
    const cache = new QueryCache(() => 0);
    const inner = vi.fn(() => 2);
    const outer = () => cache.get('outer', [], () => cache.get('inner', [], inner) * 10);
    expect(outer()).toBe(20);
    expect(cache.get('inner', [], inner)).toBe(2);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('Database.dataVersion', () => {
  async function database(): Promise<Database> {
    const db = await Database.openInMemory();
    migrate(db);
    return db;
  }

  test('moves on every write and stays put for reads', async () => {
    const db = await database();
    const before = db.dataVersion;
    db.all('SELECT * FROM workout');
    db.value('SELECT count(*) FROM exercise');
    expect(db.dataVersion).toBe(before);
    db.run("INSERT INTO appSetting (key, value) VALUES ('a', '1')");
    expect(db.dataVersion).toBeGreaterThan(before);
    db.close();
  });

  test('a read-only transaction keeps the version; a rollback after writes moves it', async () => {
    const db = await database();
    const before = db.dataVersion;
    db.transaction(() => db.all('SELECT * FROM workout'));
    expect(db.dataVersion).toBe(before);
    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO appSetting (key, value) VALUES ('b', '1')");
        throw new Error('undo');
      }),
    ).toThrow('undo');
    const afterWrite = before + 1;
    expect(db.dataVersion).toBeGreaterThan(afterWrite);
    db.close();
  });

  test('a cached read made inside a transaction that rolls back is not reused', async () => {
    const db = await database();
    const count = () => db.cache.get('settings', [], () => db.value<number>('SELECT count(*) FROM appSetting') ?? 0);
    const before = count();
    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO appSetting (key, value) VALUES ('c', '1')");
        expect(count()).toBe(before + 1);
        throw new Error('undo');
      }),
    ).toThrow('undo');
    expect(count()).toBe(before);
    db.close();
  });
});
