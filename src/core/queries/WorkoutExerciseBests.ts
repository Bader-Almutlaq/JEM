import type { Database } from '../db/Database';
import type { ExerciseTracking } from '../library/ExerciseTracking';
import type { WeightUnit } from '../units/WeightUnit';

/** The best set of one exercise within a workout, as the history card shows it. */
export interface WorkoutExerciseBest {
  readonly workoutId: number;
  readonly exerciseId: number;
  readonly name: string;
  readonly tracking: ExerciseTracking;
  /** Non-warm-up sets of this exercise in the workout. */
  readonly setCount: number;
  readonly best: {
    readonly weightKilograms: number;
    readonly reps: number;
    readonly durationSeconds: number | null;
    readonly rpe: number | null;
    readonly entryUnit: WeightUnit;
  };
}

interface BestRow {
  readonly workoutId: number;
  readonly exerciseId: number;
  readonly name: string;
  readonly tracking: ExerciseTracking;
  readonly setCount: number;
  readonly weightKilograms: number;
  readonly reps: number;
  readonly durationSeconds: number | null;
  readonly rpe: number | null;
  readonly entryUnit: WeightUnit;
}

/**
 * Each exercise of finished workouts with its non-warm-up set count and its best set, grouped by workout
 * and in logged order. Pass `workoutIds` to restrict it to those workouts.
 *
 * Heuristic: the best set is the heaviest, then the one with most reps, then the longest; unloaded sets
 * therefore rank by reps and timed sets by duration. It is a description for a list, not a strength
 * ranking: estimated 1RM (see `ExerciseStrength`) is the strength measure. An exercise with only warm-ups
 * has no best set and is left out.
 */
export function workoutExerciseBests(
  db: Database,
  workoutIds?: readonly number[],
): ReadonlyMap<number, readonly WorkoutExerciseBest[]> {
  const scope = workoutIds === undefined ? '' : `AND w.id IN (${workoutIds.map(() => '?').join(', ')})`;
  return db.cache.get('WorkoutExerciseBests', [workoutIds?.join(',')], () => {
    // Filters sit inside the ranking: the window only ranks sets of the finished workouts asked for, and since it
    // partitions by exercise entry, filtering first cannot change any entry's ranking.
    const rows = db.all<BestRow>(
      `
      WITH ranked AS (
        SELECT we.workoutId, we.exerciseId, we.position AS entryPosition,
               s.weightKilograms, s.reps, s.durationSeconds, s.rpe, s.entryUnit,
               ROW_NUMBER() OVER (
                 PARTITION BY s.workoutExerciseId
                 ORDER BY s.weightKilograms DESC, s.reps DESC, COALESCE(s.durationSeconds, 0) DESC, s.position
               ) AS place,
               COUNT(*) OVER (PARTITION BY s.workoutExerciseId) AS setCount
        FROM workoutSet s
        JOIN workoutExercise we ON we.id = s.workoutExerciseId
        JOIN workout w ON w.id = we.workoutId
        WHERE s.kind <> 'warmup' AND w.isInProgress = 0 ${scope}
      )
      SELECT r.workoutId, r.exerciseId, e.name, e.tracking, r.setCount,
             r.weightKilograms, r.reps, r.durationSeconds, r.rpe, r.entryUnit
      FROM ranked r
      JOIN exercise e ON e.id = r.exerciseId
      WHERE r.place = 1
      ORDER BY r.workoutId, r.entryPosition
      `,
      workoutIds === undefined ? [] : [...workoutIds],
    );
    const byWorkout = new Map<number, WorkoutExerciseBest[]>();
    for (const row of rows) {
      const entries = byWorkout.get(row.workoutId) ?? [];
      entries.push({
        workoutId: row.workoutId,
        exerciseId: row.exerciseId,
        name: row.name,
        tracking: row.tracking,
        setCount: row.setCount,
        best: {
          weightKilograms: row.weightKilograms,
          reps: row.reps,
          durationSeconds: row.durationSeconds,
          rpe: row.rpe,
          entryUnit: row.entryUnit,
        },
      });
      byWorkout.set(row.workoutId, entries);
    }
    return byWorkout;
  });
}
