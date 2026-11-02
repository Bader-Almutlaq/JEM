import type { Database } from '../db/Database';

/**
 * A cache-key part for "finished history through `now`".
 *
 * Queries read finished workouts with `startedAt <= now`. Every `now` at or after the newest finished
 * workout's start reads exactly the same rows, so those calls share the key `'all'` and one cached
 * result, whatever the clock says. An earlier `now` (a past period, or a workout dated in the future)
 * keys on the exact timestamp. Any new or edited workout is a write, which clears the cache anyway.
 */
export function historyBoundaryKey(db: Database, now: Date): string {
  const latest = db.cache.get(
    'latestFinishedWorkoutStart',
    [],
    () => db.value<string>('SELECT MAX(startedAt) FROM workout WHERE isInProgress = 0') ?? null,
  );
  const timestamp = now.toISOString();
  return latest === null || timestamp >= latest ? 'all' : timestamp;
}
