/** One argument of a cached query. `undefined` and `null` stay distinct (an unset filter is not "none"). */
export type QueryCacheKeyPart = string | number | boolean | null | undefined;

/** Size of each connection's result cache. */
export const QueryCacheLimits = Object.freeze({
  /**
   * Heuristic: room for every exercise's history, curve and trend (about 80 lifts, a few variants each)
   * plus the screens' whole results, while keeping memory in the worker bounded. Least recently used
   * results are dropped first.
   */
  entries: 600,
});

/** Hits and misses since the cache was created, for the benchmark and tests. */
export interface QueryCacheStatistics {
  readonly hits: number;
  readonly misses: number;
  readonly entries: number;
}

/**
 * Remembers query results for one database connection until the data changes.
 *
 * Each result is keyed by a query name plus its arguments and is valid for one data version
 * (`Database.dataVersion`, which moves on every write, rollback, import, restore and migration).
 * The first read at a new version drops everything, so a cached read always equals a fresh one.
 * Results are shared by reference: callers must treat them as read-only, as every query's types say.
 * A computation that throws is not cached.
 */
export class QueryCache {
  private readonly results = new Map<string, unknown>();
  private version: number;
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly currentVersion: () => number,
    private readonly capacity: number = QueryCacheLimits.entries,
  ) {
    this.version = currentVersion();
  }

  /**
   * The result of `name(...parts)` at the current data version, computing and keeping it on a miss.
   * `name` must always produce the same type of value; `parts` must hold every input the result depends on.
   */
  get<Value>(name: string, parts: readonly QueryCacheKeyPart[], compute: () => Value): Value {
    this.dropIfStale();
    const key = cacheKey(name, parts);
    if (this.results.has(key)) {
      this.hits += 1;
      const value = this.results.get(key);
      // Refresh recency: a Map iterates in insertion order, so the oldest entry is first.
      this.results.delete(key);
      this.results.set(key, value);
      // Safe: every entry under this key was produced by the same `name`, which always returns `Value`.
      return value as Value;
    }
    this.misses += 1;
    const value = compute();
    // A write during `compute` means the value may mix old and new data: return it, but don't keep it.
    if (this.currentVersion() !== this.version) return value;
    this.results.set(key, value);
    while (this.results.size > this.capacity) {
      const oldest = this.results.keys().next();
      if (oldest.done === true) break;
      this.results.delete(oldest.value);
    }
    return value;
  }

  /** Forgets every result, for example when the connection closes. */
  clear(): void {
    this.results.clear();
  }

  /** Hits, misses and current size. */
  statistics(): QueryCacheStatistics {
    return { hits: this.hits, misses: this.misses, entries: this.results.size };
  }

  private dropIfStale(): void {
    const version = this.currentVersion();
    if (version === this.version) return;
    this.results.clear();
    this.version = version;
  }
}

function cacheKey(name: string, parts: readonly QueryCacheKeyPart[]): string {
  return `${name}(${parts.map(encodePart).join(',')})`;
}

function encodePart(part: QueryCacheKeyPart): string {
  if (part === undefined) return 'u';
  if (part === null) return 'n';
  if (typeof part === 'string') return JSON.stringify(part);
  return `${typeof part === 'number' ? 'd' : 'b'}${String(part)}`;
}
