import type { Database } from '../db/Database';
import { fromWorkoutSetRow, type WorkoutSetRow } from '../models/WorkoutSet';
import { groupBy } from '../support/groupBy';
import type { ExerciseSession } from './ExerciseSeries';
import { historyBoundaryKey } from './HistoryBoundary';

interface SessionRow {
  readonly workoutId: number;
  readonly date: string;
  readonly name: string;
}

/**
 * Finished sessions of one exercise, newest first, with completed sets (warm-ups included), deload
 * marks and machine entries. `limit` −1 reads all. Sets keep logging order: entry position, then set position.
 */
function page(
  db: Database,
  exerciseId: number,
  now: Date,
  limit: number,
  offset: number,
  templateId?: number,
): ExerciseSession[] {
  const selected = db.all<SessionRow>(
    `
    SELECT w.id AS workoutId, w.startedAt AS date, w.name
    FROM workout w
    WHERE w.id IN (SELECT we.workoutId FROM workoutExercise we WHERE we.exerciseId = ?)
      AND w.isInProgress = 0 AND w.startedAt <= ?
      AND (? IS NULL OR w.templateId = ?)
    ORDER BY w.startedAt DESC, w.id DESC
    LIMIT ? OFFSET ?
    `,
    // The exercise's workouts are looked up once (by exerciseId), not once per workout in the history.
    [exerciseId, now.toISOString(), templateId ?? null, templateId ?? null, limit, offset],
  );
  if (selected.length === 0) return [];
  const placeholders = selected.map(() => '?').join(', ');
  const workoutIds = selected.map((session) => session.workoutId);
  const byWorkout = (row: { readonly workoutId: number }) => row.workoutId;
  const sets = groupBy(
    db
      .all<WorkoutSetRow & { readonly workoutId: number }>(
        `
        SELECT s.*, we.workoutId
        FROM workoutExercise we
        JOIN workoutSet s ON s.workoutExerciseId = we.id
        WHERE we.exerciseId = ? AND s.isCompleted = 1 AND we.workoutId IN (${placeholders})
        ORDER BY we.position, we.id, s.position, s.id
        `,
        [exerciseId, ...workoutIds],
      )
      .map((row) => ({ workoutId: row.workoutId, set: fromWorkoutSetRow(row) })),
    byWorkout,
  );
  const deloads = groupBy(
    db.all<{ id: number; workoutId: number }>(
      `SELECT id, workoutId FROM workoutExercise
       WHERE exerciseId = ? AND deloadStage IS NOT NULL AND workoutId IN (${placeholders})`,
      [exerciseId, ...workoutIds],
    ),
    byWorkout,
  );
  const entries = groupBy(
    db.all<{ id: number; workoutId: number; machineBrand: string | null }>(
      `SELECT id, workoutId, machineBrand FROM workoutExercise
       WHERE exerciseId = ? AND workoutId IN (${placeholders}) ORDER BY position, id`,
      [exerciseId, ...workoutIds],
    ),
    byWorkout,
  );
  // Grouped once by workout: filtering every row per session was quadratic in the history's length.
  return selected.map((session) => ({
    ...session,
    sets: (sets.get(session.workoutId) ?? []).map((row) => row.set),
    machineEntries: (entries.get(session.workoutId) ?? []).map(({ id, machineBrand }) => ({ id, machineBrand })),
    deloadEntryIds: (deloads.get(session.workoutId) ?? []).map((entry) => entry.id),
  }));
}

/**
 * The one database read of an exercise's finished history. Bounded pages serve History; the full,
 * oldest-first history feeds the personal curve, chart series, records and strength trend, and is kept
 * in the connection's cache until this exercise changes, so each lift's history is read once per exercise version.
 */
export const ExerciseSessions = Object.freeze({
  /** A newest-first page of finished sessions through `now`, optionally limited to one saved workout. */
  page(
    db: Database,
    exerciseId: number,
    now: Date,
    limit: number,
    offset: number,
    templateId?: number,
  ): readonly ExerciseSession[] {
    const key = [historyBoundaryKey(db, now, exerciseId), limit, offset, templateId];
    return db.cache.getForExercise(exerciseId, 'ExerciseSessions.page', key, () =>
      page(db, exerciseId, now, limit, offset, templateId),
    );
  },

  /** Every finished session through `now`, oldest first, optionally limited to one saved workout. Cached. */
  all(db: Database, exerciseId: number, now: Date, templateId?: number): readonly ExerciseSession[] {
    const key = [exerciseId, historyBoundaryKey(db, now, exerciseId), templateId];
    return db.cache.getForExercise(exerciseId, 'ExerciseSessions.all', key, () =>
      page(db, exerciseId, now, -1, 0, templateId).reverse(),
    );
  },
});
