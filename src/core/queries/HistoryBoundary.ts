import type { Database } from '../db/Database';

/**
 * A cache-key part for "finished history through `now`".
 *
 * Queries read finished workouts with `startedAt <= now`. Every `now` at or after the newest finished
 * workout's start reads exactly the same rows, so those calls share the key `'all'` and one cached
 * result, whatever the clock says. An earlier `now` (a past period, or a workout dated in the future)
 * keys on the exact timestamp. With an exercise id, only its workouts define the boundary, so a
 * different lift dated into the future does not disturb this lift's cache. Omitting the id keeps
 * the global boundary for multi-exercise queries. Workout writes advance the appropriate revisions.
 */
export function historyBoundaryKey(db: Database, now: Date, exerciseId?: number): string {
  const latest =
    exerciseId === undefined
      ? db.cache.get(
          'latestFinishedWorkoutStart',
          [],
          () => db.value<string>('SELECT MAX(startedAt) FROM workout WHERE isInProgress = 0') ?? null,
        )
      : db.cache.getForExercise(
          exerciseId,
          'latestFinishedWorkoutStart',
          [],
          () =>
            db.value<string>(
              `
              SELECT MAX(startedAt) FROM workout
              WHERE isInProgress = 0
                AND id IN (SELECT workoutId FROM workoutExercise WHERE exerciseId = ?)
            `,
              [exerciseId],
            ) ?? null,
        );
  const timestamp = now.toISOString();
  return latest === null || timestamp >= latest ? 'all' : timestamp;
}
