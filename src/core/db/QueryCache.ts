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

interface Entry {
  readonly exerciseId: number | undefined;
  readonly version: number;
  readonly value: unknown;
}

/**
 * Remembers query results for one database connection until the data changes.
 *
 * Global results follow `Database.dataVersion`; per-exercise results follow that lift's revision.
 * A global write drops whole-screen results while untouched lifts remain reusable. Unsupported
 * writes, scripts and rollbacks also advance every lift's revision.
 * Results are shared by reference: callers must treat them as read-only, as every query's types say.
 * A computation that throws is not cached.
 */
export class QueryCache {
  private readonly results = new Map<string, Entry>();
  private version: number;
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly currentVersion: () => number,
    private readonly capacity: number = QueryCacheLimits.entries,
    private readonly currentExerciseVersion: (exerciseId: number) => number = () => currentVersion(),
  ) {
    this.version = currentVersion();
  }

  /**
   * The result of `name(...parts)` at the current data version, computing and keeping it on a miss.
   * `name` must always produce the same type of value; `parts` must hold every input the result depends on.
   */
  get<Value>(name: string, parts: readonly QueryCacheKeyPart[], compute: () => Value): Value {
    return this.read(undefined, name, parts, compute);
  }

  /**
   * Remembers a result depending only on this exercise's rows and its own metadata.
   * Clock boundaries and all other explicit inputs must remain in `parts`; shared dependencies
   * (settings, template rows, other exercises) must use the global API instead.
   */
  getForExercise<Value>(
    exerciseId: number,
    name: string,
    parts: readonly QueryCacheKeyPart[],
    compute: () => Value,
  ): Value {
    return this.read(exerciseId, name, parts, compute);
  }

  private read<Value>(
    exerciseId: number | undefined,
    name: string,
    parts: readonly QueryCacheKeyPart[],
    compute: () => Value,
  ): Value {
    this.dropIfStale();
    const version = exerciseId === undefined ? this.currentVersion() : this.currentExerciseVersion(exerciseId);
    const key = cacheKey(name, [exerciseId, ...parts]);
    const entry = this.results.get(key);
    if (entry !== undefined && entry.version === version) {
      this.hits += 1;
      this.results.delete(key);
      this.results.set(key, entry);
      // Safe: each query name and scope consistently produces Value.
      return entry.value as Value;
    }
    this.results.delete(key);
    this.misses += 1;
    const before = this.currentVersion();
    const value = compute();
    // Even an unrelated write during computation can mix snapshots; never retain that result.
    if (this.currentVersion() !== before) return value;
    this.results.set(key, { exerciseId, version, value });
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
    for (const [key, entry] of this.results) {
      if (entry.exerciseId === undefined || entry.version !== this.currentExerciseVersion(entry.exerciseId)) {
        this.results.delete(key);
      }
    }
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
