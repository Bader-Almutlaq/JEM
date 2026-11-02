import * as Comlink from 'comlink';
import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import type { WorkerApi } from '../../worker/WorkerApi';
import { log } from '../../core/support/log';
import { ChangeCoalescer } from './ChangeCoalescer';
import { QueryResultStore, type QueryState } from './QueryResultStore';

export type { QueryState } from './QueryResultStore';
export { messageOf } from './messageOf';

/**
 * The screen's handle on the database worker. Every call is async because it crosses threads.
 * There is exactly one worker per open app.
 */
export const database: Comlink.Remote<WorkerApi> = Comlink.wrap<WorkerApi>(
  new Worker(new URL('../../worker/database.worker.ts', import.meta.url), { type: 'module' }),
);

/** Refresh timing. Heuristic: one refresh per frame keeps a live workout responsive; hidden pages get no frames. */
const RefreshTiming = Object.freeze({ hiddenPageMilliseconds: 100 });

/** Runs `flush` on the next animation frame, or after a short delay if frames are paused (page hidden). */
function nextFrame(flush: () => void): void {
  let hasRun = false;
  const runOnce = () => {
    if (hasRun) return;
    hasRun = true;
    flush();
  };
  requestAnimationFrame(runOnce);
  setTimeout(runOnce, RefreshTiming.hiddenPageMilliseconds);
}

/** Results of every `useDatabaseQuery`, shared by all screens (see `QueryResultStore`). */
const results = new QueryResultStore();
const refreshers = new Set<() => void>();
const changes = new ChangeCoalescer(nextFrame, () => {
  for (const refresh of refreshers) refresh();
});

// One subscription for the whole app: the worker calls a single listener per write, and bursts of writes
// (a live workout) become one refresh per frame.
database
  .subscribe(
    Comlink.proxy((dataVersion: number) => {
      results.noteVersion(dataVersion);
      changes.notify(dataVersion);
    }),
  )
  .catch((error: unknown) => log.ui.error('Listening for database changes failed', error));

const loading: QueryState<never> = { status: 'loading' };

/**
 * Runs `query` against the database and keeps the screen current after writes.
 * `key` names the query and every argument it uses (for example `exercise-${id}`): the same key must always
 * mean the same query, because results are remembered by key across screens.
 *
 * A remembered result shows at once (returning to a screen, switching a period back) and is re-read in the
 * background only when the data changed since, or it is over a minute old. A key never seen keeps showing
 * the previous key's result until its own arrives, as before.
 */
export function useDatabaseQuery<Value>(key: string, query: () => Promise<Value>): QueryState<Value> {
  const run = useEffectEvent(query);
  const subscribe = useCallback((onChange: () => void) => results.watch(key, onChange), [key]);
  const settled = useSyncExternalStore(subscribe, () => results.peek(key));
  const [previous, setPrevious] = useState<QueryState<unknown>>(loading);

  useEffect(() => {
    let isCurrent = true;
    const refresh = () => {
      if (!results.isStale(key)) return;
      void results
        .load(key, () => run())
        .then(() => {
          const latest = results.peek(key);
          if (isCurrent && latest !== undefined) setPrevious(latest);
        });
    };
    refresh();
    refreshers.add(refresh);
    return () => {
      isCurrent = false;
      refreshers.delete(refresh);
    };
  }, [key]);

  // Safe: a key always names the same query (the documented contract above), so its result is a `Value`.
  return (settled ?? previous) as QueryState<Value>;
}
