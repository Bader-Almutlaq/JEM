import { fromWorkoutExerciseRow, type WorkoutExercise, type WorkoutExerciseRow } from '../models/WorkoutExercise';
import type { Database } from '../db/Database';
import { fromWorkoutSetRow, type WorkoutSet, type WorkoutSetRow } from '../models/WorkoutSet';

/**
 * Completed sets in logged order; prefer the latest session of a template before falling back anywhere.
 * A zero-based occurrence selects one repeated exercise entry; null combines every entry as before.
 */
export function previousPerformance(
  db: Database,
  exerciseId: number,
  excludingWorkout: number | null = null,
  preferredTemplateId: number | null = null,
  occurrence: number | null = null,
): WorkoutSet[] {
  const workoutId = db.value<number>(
    `
    SELECT w.id FROM workout w JOIN workoutExercise we ON we.workoutId = w.id
    WHERE we.exerciseId = ? AND w.isInProgress = 0 AND w.id IS NOT ?
    ORDER BY CASE WHEN w.templateId = ? THEN 0 ELSE 1 END, w.startedAt DESC, w.id DESC LIMIT 1
  `,
    [exerciseId, excludingWorkout, preferredTemplateId],
  );
  if (workoutId === undefined) return [];
  const entryId =
    occurrence === null
      ? null
      : db.value<number>(
          `
    SELECT id FROM workoutExercise
    WHERE workoutId = ? AND exerciseId = ?
    ORDER BY position LIMIT 1 OFFSET ?
    `,
          [workoutId, exerciseId, occurrence],
        );
  if (entryId === undefined) return [];
  return db
    .all<WorkoutSetRow>(
      `
    SELECT s.* FROM workoutSet s JOIN workoutExercise we ON we.id = s.workoutExerciseId
    WHERE we.workoutId = ? AND we.exerciseId = ? AND s.isCompleted = 1
      AND (? IS NULL OR we.id = ?)
    ORDER BY we.position, s.position
  `,
      [workoutId, exerciseId, entryId, entryId],
    )
    .map(fromWorkoutSetRow);
}

/** Previous sets and whether a recorded machine required falling back to another or unknown machine. */
export function machinePreviousPerformance(
  db: Database,
  exerciseId: number,
  excludingWorkout: number | null,
  preferredTemplateId: number | null,
  occurrence: number | null,
  machineBrand: string | null,
): { sets: WorkoutSet[]; otherMachine: boolean } {
  if (machineBrand === null) {
    return {
      sets: previousPerformance(db, exerciseId, excludingWorkout, preferredTemplateId, occurrence),
      otherMachine: false,
    };
  }
  const entry = db.get<{ id: number }>(
    `
    SELECT we.id FROM workoutExercise we JOIN workout w ON w.id = we.workoutId
    WHERE we.exerciseId = ? AND w.isInProgress = 0 AND w.id IS NOT ?
      AND we.machineBrand = ? COLLATE NOCASE
      AND (SELECT COUNT(*) FROM workoutExercise earlier
           WHERE earlier.workoutId = we.workoutId AND earlier.exerciseId = we.exerciseId
             AND (earlier.position < we.position OR (earlier.position = we.position AND earlier.id < we.id))) = ?
    ORDER BY CASE WHEN w.templateId = ? THEN 0 ELSE 1 END, w.startedAt DESC, w.id DESC LIMIT 1
    `,
    [exerciseId, excludingWorkout, machineBrand, occurrence ?? 0, preferredTemplateId],
  );
  if (entry !== undefined) return { sets: completedEntrySets(db, entry.id), otherMachine: false };
  const sets = previousPerformance(db, exerciseId, excludingWorkout, preferredTemplateId, occurrence);
  return { sets, otherMachine: sets.length > 0 };
}

/** Manufacturers used in finished workouts, ordered by most recent use, with case-insensitive deduplication. */
export function usedMachineBrands(db: Database): string[] {
  const rows = db.all<{ machineBrand: string }>(`
    SELECT we.machineBrand FROM workoutExercise we JOIN workout w ON w.id = we.workoutId
    WHERE w.isInProgress = 0 AND we.machineBrand IS NOT NULL
    ORDER BY w.startedAt DESC, w.id DESC, we.position DESC, we.id DESC
  `);
  const seen = new Set<string>();
  return rows
    .map((row) => row.machineBrand)
    .filter((brand) => {
      const key = brand.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Brand on the latest finished occurrence of an exercise, including an unrecorded brand. */
export function latestMachineBrand(db: Database, exerciseId: number, excludingWorkout: number | null): string | null {
  return (
    db.value<string | null>(
      `
    SELECT we.machineBrand FROM workoutExercise we JOIN workout w ON w.id = we.workoutId
    WHERE we.exerciseId = ? AND w.isInProgress = 0 AND w.id IS NOT ?
    ORDER BY w.startedAt DESC, w.id DESC, we.position DESC, we.id DESC LIMIT 1
  `,
      [exerciseId, excludingWorkout],
    ) ?? null
  );
}

/** Match each current set to the corresponding previous warm-up or non-warm-up, in order. */
export function matchPreviousSets<T extends { readonly kind: string }>(
  current: readonly { readonly kind: string }[],
  previous: readonly T[],
): (T | undefined)[] {
  const warmups = previous.filter((set) => set.kind === 'warmup');
  const workSets = previous.filter((set) => set.kind !== 'warmup');
  let warmupIndex = 0;
  let workIndex = 0;
  return current.map((set) => (set.kind === 'warmup' ? warmups[warmupIndex++] : workSets[workIndex++]));
}

/** Previous finished occurrence before this entry's session (date then id); never another entry in this workout.
 * Heuristic: repeated exercises follow the same occurrence across sessions; missing occurrences have no predecessor.
 */
export function previousExerciseEntry(
  db: Database,
  entryId: number,
  machineBrand: string | null = null,
): WorkoutExercise | undefined {
  const current = db.get<{ exerciseId: number; workoutId: number; position: number; startedAt: string }>(
    `
    SELECT we.exerciseId, we.workoutId, we.position, w.startedAt
    FROM workoutExercise we JOIN workout w ON w.id = we.workoutId WHERE we.id = ?
  `,
    [entryId],
  );
  if (current === undefined) return undefined;
  const occurrence =
    db.value<number>(
      `
    SELECT COUNT(*) FROM workoutExercise WHERE workoutId = ? AND exerciseId = ? AND position < ?
  `,
      [current.workoutId, current.exerciseId, current.position],
    ) ?? 0;
  return previousExerciseEntryBefore(db, { ...current, occurrence }, machineBrand);
}

/** Read-only predecessor lookup for a persisted entry or an unstarted session (null workoutId).
 * Heuristic: repeated exercises follow their occurrence, with no predecessor for missing occurrences.
 */
export function previousExerciseEntryBefore(
  db: Database,
  current: {
    readonly exerciseId: number;
    readonly workoutId: number | null;
    readonly startedAt: string;
    readonly occurrence: number;
  },
  machineBrand: string | null = null,
): WorkoutExercise | undefined {
  if (machineBrand !== null) {
    const matching = db.get<WorkoutExerciseRow>(
      `
      SELECT we.* FROM workoutExercise we JOIN workout w ON w.id = we.workoutId
      WHERE we.exerciseId = ? AND w.isInProgress = 0 AND w.id IS NOT ?
        AND (w.startedAt < ? OR (w.startedAt = ? AND (? IS NULL OR w.id < ?)))
        AND we.machineBrand = ? COLLATE NOCASE
        AND (SELECT COUNT(*) FROM workoutExercise earlier WHERE earlier.workoutId = we.workoutId
          AND earlier.exerciseId = we.exerciseId AND earlier.position < we.position) = ?
      ORDER BY w.startedAt DESC, w.id DESC LIMIT 1
      `,
      [
        current.exerciseId,
        current.workoutId,
        current.startedAt,
        current.startedAt,
        current.workoutId,
        current.workoutId,
        machineBrand,
        current.occurrence,
      ],
    );
    if (matching !== undefined) return fromWorkoutExerciseRow(matching);
  }
  const workoutId = db.value<number>(
    `
    SELECT w.id FROM workout w WHERE w.isInProgress = 0 AND w.id IS NOT ?
      AND (w.startedAt < ? OR (w.startedAt = ? AND (? IS NULL OR w.id < ?)))
      AND EXISTS (SELECT 1 FROM workoutExercise we WHERE we.workoutId = w.id AND we.exerciseId = ?)
    ORDER BY w.startedAt DESC, w.id DESC LIMIT 1
  `,
    [current.workoutId, current.startedAt, current.startedAt, current.workoutId, current.workoutId, current.exerciseId],
  );
  if (workoutId === undefined) return undefined;
  const row = db.get<WorkoutExerciseRow>(
    `
    SELECT * FROM workoutExercise WHERE workoutId = ? AND exerciseId = ? ORDER BY position LIMIT 1 OFFSET ?
  `,
    [workoutId, current.exerciseId, current.occurrence],
  );
  return row === undefined ? undefined : fromWorkoutExerciseRow(row);
}

/** Pre-cycle completed sets for deload load calculations; walks stage rows back to the first normal predecessor.
 * Missing normal history returns no load baseline rather than guessing an unrounded original weight.
 */
export function deloadBaseline(db: Database, entryId: number, machineBrand: string | null = null): WorkoutSet[] {
  let previous = previousExerciseEntry(db, entryId, machineBrand);
  while (previous !== undefined && (previous.deloadStage ?? null) !== null)
    previous = previousExerciseEntry(db, previous.id, machineBrand);
  return previous === undefined ? [] : completedEntrySets(db, previous.id);
}

/** Completed sets of one known occurrence in logged order, with no template/session fallback. */
export function completedEntrySets(db: Database, entryId: number): WorkoutSet[] {
  return db
    .all<WorkoutSetRow>(
      `
    SELECT * FROM workoutSet WHERE workoutExerciseId = ? AND isCompleted = 1 ORDER BY position
  `,
      [entryId],
    )
    .map(fromWorkoutSetRow);
}
