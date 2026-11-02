import { personalCurve, type PersonalCurve, type PersonalCurveSet } from '../analytics/PersonalCurve';
import type { Database } from '../db/Database';
import type { StrengthExercise } from '../analytics/EstimatedOneRepMax';
import { historyBoundaryKey } from './HistoryBoundary';
import { ExerciseSessions } from './ExerciseSessions';

/**
 * Canonical database boundary for personal curves. Finished, completed history through now,
 * across all saved workouts and machines, supplies one curve per exercise (report item 3).
 * Scope and machine selection change the displayed sessions, never the identity of the lift's curve.
 * Fitting searches 85 values of k over the whole history, so the result is kept in the connection's
 * cache until this exercise changes; every caller for the same lift shares it.
 */
export function ExerciseCurve(
  db: Database,
  exerciseId: number,
  exercise: StrengthExercise,
  now = new Date(),
): PersonalCurve {
  const key = [
    exerciseId,
    exercise.equipment,
    exercise.movementPattern,
    exercise.mechanic,
    exercise.tracking,
    historyBoundaryKey(db, now, exerciseId),
  ];
  return db.cache.getForExercise(exerciseId, 'ExerciseCurve', key, () => {
    // The same rows, in the same order, as a query of completed sets by start time, workout, entry and set position.
    const sets: PersonalCurveSet[] = ExerciseSessions.all(db, exerciseId, now).flatMap((session) =>
      session.sets.map(({ kind, weightKilograms, reps, rpe }) => ({
        kind,
        weightKilograms,
        reps,
        rpe,
        date: session.date,
      })),
    );
    return personalCurve(exercise, sets);
  });
}
