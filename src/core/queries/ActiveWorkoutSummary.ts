import type { Database } from '../db/Database';

/** The little the app's chrome needs about the workout being logged: enough to name it and run its clock. */
export interface ActiveWorkoutSummary {
  readonly id: number;
  readonly name: string;
  /** UTC ISO 8601 timestamp. */
  readonly startedAt: string;
}

/**
 * The workout currently being logged, or `undefined` when none is. This is the one rule for "which workout is in
 * progress" (the newest one flagged in progress); `WorkoutLogger.activeWorkoutId` reads it too. One indexed row,
 * so it is cheap to re-run after every write, unlike the full live-workout snapshot.
 */
export function activeWorkoutSummary(db: Database): ActiveWorkoutSummary | undefined {
  return db.get<ActiveWorkoutSummary>(
    'SELECT id, name, startedAt FROM workout WHERE isInProgress = 1 ORDER BY startedAt DESC LIMIT 1',
  );
}
