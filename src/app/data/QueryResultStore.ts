import { messageOf } from './messageOf';

/** The state of a query as a screen renders it. */
export type QueryState<Value> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: Value }
  | { readonly status: 'failed'; readonly message: string };

/** A finished query: its value or the reason it failed. */
export type SettledQueryState<Value> = Exclude<QueryState<Value>, { readonly status: 'loading' }>;

/** How long and how many screen results are kept. */
export const QueryResultPolicy = Object.freeze({
  /** Last results kept for returning to a screen or a period chip; the T-091 brief asks for about 50. */
  entries: 50,
  /**
   * Heuristic: a result older than a minute is shown at once but quietly re-read, even with no write
   * since, because a few screens depend on the clock (today's date, "weeks since") as well as the data.
   */
  maximumReuseMilliseconds: 60_000,
});

interface Entry {
  readonly state: SettledQueryState<unknown>;
  /** The data version announced before the read started; the result is at least this fresh. */
  readonly version: number;
  readonly settledAt: number;
}

/**
 * The screen's memory of query results, keyed by `useDatabaseQuery` keys. Plain TypeScript (no React,
 * no worker), so its rules are tested directly:
 * - keeps the last `QueryResultPolicy.entries` results, dropping the least recently used ones no screen shows;
 * - a result is stale once the worker announces a newer data version, when it failed, or after
 *   `maximumReuseMilliseconds`; a fresh result is reused without asking the worker;
 * - one read per key at a time: a second request joins the running one unless that one started
 *   before the latest data version, and an older read never overwrites a newer one.
 */
export class QueryResultStore {
  private readonly entries = new Map<string, Entry>();
  private readonly watchers = new Map<string, Set<() => void>>();
  private readonly running = new Map<string, { readonly version: number; readonly done: Promise<void> }>();
  private readonly tickets = new Map<string, number>();
  private latestVersion = 0;

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly capacity: number = QueryResultPolicy.entries,
  ) {}

  /** The newest data version announced by the worker. */
  get version(): number {
    return this.latestVersion;
  }

  /** Records a data version announced by the worker. Versions only grow; an older one is ignored. */
  noteVersion(version: number): void {
    this.latestVersion = Math.max(this.latestVersion, version);
  }

  /** The last settled state for `key`, or `undefined`. Never changes recency, so it is safe while rendering. */
  peek(key: string): SettledQueryState<unknown> | undefined {
    return this.entries.get(key)?.state;
  }

  /** Whether `key` has no result, a failed one, one older than the latest data version, or an old one. */
  isStale(key: string): boolean {
    const entry = this.entries.get(key);
    return (
      entry === undefined ||
      entry.state.status === 'failed' ||
      entry.version < this.latestVersion ||
      this.clock() - entry.settledAt > QueryResultPolicy.maximumReuseMilliseconds
    );
  }

  /**
   * Reads `key` with `fetch` and keeps the result, telling the key's watchers. Joins a read already running
   * for `key` when that read started at the latest data version. Never rejects: failures become failed states.
   */
  load(key: string, fetch: () => Promise<unknown>): Promise<void> {
    const current = this.running.get(key);
    if (current !== undefined && current.version >= this.latestVersion) return current.done;
    const version = this.latestVersion;
    const ticket = (this.tickets.get(key) ?? 0) + 1;
    this.tickets.set(key, ticket);
    const done = new Promise<unknown>((resolve) => resolve(fetch()))
      .then(
        (value): SettledQueryState<unknown> => ({ status: 'ready', value }),
        (error: unknown): SettledQueryState<unknown> => ({ status: 'failed', message: messageOf(error) }),
      )
      .then((state) => {
        // A read started later (after a newer write) owns the key now; this older result is dropped.
        if (this.tickets.get(key) !== ticket) return;
        this.running.delete(key);
        this.remember(key, { state, version, settledAt: this.clock() });
      });
    this.running.set(key, { version, done });
    return done;
  }

  /** Calls `onChange` whenever `key`'s result changes; a watched result is never evicted. Returns the unsubscribe. */
  watch(key: string, onChange: () => void): () => void {
    const watchers = this.watchers.get(key) ?? new Set<() => void>();
    watchers.add(onChange);
    this.watchers.set(key, watchers);
    this.touch(key);
    return () => {
      watchers.delete(onChange);
      if (watchers.size === 0) this.watchers.delete(key);
    };
  }

  /** Keys currently held, least recently used first. */
  keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  private remember(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.evict();
    for (const watcher of this.watchers.get(key) ?? []) watcher();
  }

  private touch(key: string): void {
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private evict(): void {
    // A Map iterates in insertion order, so the least recently used results come first.
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.capacity) return;
      if (!this.watchers.has(key)) this.entries.delete(key);
    }
  }
}
