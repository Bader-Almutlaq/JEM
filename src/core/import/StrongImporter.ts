import { WorkoutLogger } from '../logging/WorkoutLogger';
import type { Database } from '../db/Database';
import { exerciseIdNamed } from '../library/ExerciseNameResolver';
import { log } from '../support/log';
import type { WeightUnit } from '../units/WeightUnit';
import type { PlannedWorkout, StrongImportPlan } from './StrongImportPlan';

/** Counts of what an import added and skipped. */
export interface ImportResult {
  readonly workoutsAdded: number;
  /** Workouts already imported or deliberately deleted earlier (same `sourceKey`). */
  readonly workoutsSkipped: number;
  readonly setsAdded: number;
  /** Sets selected to be left out of this import. */
  readonly setsExcluded: number;
  readonly exercisesCreated: number;
  /** Measurements not already present (same time, site and relaxed state). */
  readonly measurementsAdded: number;
}

/** The running counts while the transaction is open. */
interface Counters {
  workoutsAdded: number;
  workoutsSkipped: number;
  setsAdded: number;
  setsExcluded: number;
  exercisesCreated: number;
  measurementsAdded: number;
}

/**
 * Writes a reviewed `StrongImportPlan` into the database in a single transaction (all or
 * nothing), and only ever *adds* rows. Workouts already imported (same `sourceKey`) and
 * measurements already present are skipped, so importing the same file twice changes nothing.
 * Deleted source keys in appSetting are also skipped, preserving deliberate History deletions.
 *
 * **Safety:** this function does not take a snapshot. The caller (the worker) must write a local
 * safety snapshot of the database before calling it (`docs/DATA.md` → Data safety).
 *
 * Exercises are matched to existing ones by name or saved alias (case-insensitive, see
 * `exerciseIdNamed`); unknown names become new exercises. An exercise without history takes the
 * unit Strong currently uses for it as its default entry unit. The owner's review decisions
 * (unit overrides, corrections) are already part of `plan`; rebuild the plan to change them.
 *
 * @param now Stamps the `createdAt` of exercises this import creates.
 */
export function importStrongPlan(db: Database, plan: StrongImportPlan, now: Date): ImportResult {
  const createdAt = now.toISOString();
  const columnUnits = new Map(plan.exercises.map((exercise) => [exercise.name, exercise.columnUnit]));

  const result = db.transaction((): ImportResult => {
    const counters: Counters = {
      workoutsAdded: 0,
      workoutsSkipped: 0,
      setsAdded: 0,
      setsExcluded: plan.setsExcluded ?? 0,
      exercisesCreated: 0,
      measurementsAdded: 0,
    };
    const exerciseIds = new Map<string, number>();

    const exerciseId = (name: string): number => {
      const known = exerciseIds.get(name);
      if (known !== undefined) return known;
      const unit: WeightUnit = columnUnits.get(name) ?? 'kg';
      const existingId = exerciseIdNamed(db, name);
      let id: number;
      if (existingId === undefined) {
        id = db.run("INSERT INTO exercise (name, source, defaultEntryUnit, createdAt) VALUES (?, 'strong', ?, ?)", [
          name,
          unit,
          createdAt,
        ]).lastInsertRowId;
        counters.exercisesCreated += 1;
      } else {
        id = existingId;
        // An exercise with no history yet (a fresh library entry) adopts Strong's unit for it.
        const historyCount = db.value<number>('SELECT count(*) FROM workoutExercise WHERE exerciseId = ?', [id]);
        if (historyCount === 0) db.run('UPDATE exercise SET defaultEntryUnit = ? WHERE id = ?', [unit, id]);
      }
      exerciseIds.set(name, id);
      return id;
    };

    const deleted = WorkoutLogger.deletedSourceKeys(db);
    for (const planned of plan.workouts) {
      if (workoutExists(db, planned, deleted)) {
        counters.workoutsSkipped += 1;
        continue;
      }
      insertWorkout(db, planned, exerciseId, counters);
      counters.workoutsAdded += 1;
    }

    for (const measurement of plan.measurements) {
      // New exports can introduce slugs that were absent when v4 ran.
      db.run(
        `
        INSERT OR IGNORE INTO measurementSite
          (key, name, kind, groupKey, side, supportsFlexed, guide, position, isCustom)
        VALUES (?, ?, ?, ?, NULL, 0, '', (SELECT COALESCE(MAX(position), -1) + 1 FROM measurementSite), 1)
      `,
        [measurement.site, measurement.site, measurement.site === 'bodyweight' ? 'mass' : 'length', measurement.site],
      );
      const { changes } = db.run(
        `INSERT OR IGNORE INTO bodyMeasurement (takenAt, site, value, source, state)
         VALUES (?, ?, ?, ?, ?)`,
        [measurement.takenAt, measurement.site, measurement.value, measurement.source, measurement.state ?? 'relaxed'],
      );
      if (changes > 0) counters.measurementsAdded += 1;
    }
    return counters;
  });
  db.invalidateAllExercises();

  log.import.info(
    `Imported ${result.workoutsAdded} workouts, ${result.setsAdded} sets; skipped ${result.workoutsSkipped}`,
  );
  return result;
}

/** Counts planned workouts already present or tombstoned by source key and those still new. */
export function strongImportWorkoutCounts(
  db: Database,
  workouts: readonly PlannedWorkout[],
): { alreadyImported: number; newWorkouts: number } {
  const existing = new Set<string>();
  const deleted = WorkoutLogger.deletedSourceKeys(db);
  let alreadyImported = 0;
  for (const workout of workouts) {
    if (existing.has(workout.sourceKey) || workoutExists(db, workout, deleted)) {
      alreadyImported += 1;
    } else {
      existing.add(workout.sourceKey);
    }
  }
  return { alreadyImported, newWorkouts: workouts.length - alreadyImported };
}

function workoutExists(db: Database, planned: PlannedWorkout, deleted: ReadonlySet<string>): boolean {
  if (deleted.has(planned.sourceKey)) return true;
  return (db.value<number>('SELECT count(*) FROM workout WHERE sourceKey = ?', [planned.sourceKey]) ?? 0) > 0;
}

function insertWorkout(
  db: Database,
  planned: PlannedWorkout,
  exerciseId: (name: string) => number,
  counters: Counters,
): void {
  const workoutId = db.run(
    "INSERT INTO workout (startedAt, endedAt, name, notes, source, sourceKey) VALUES (?, ?, ?, ?, 'strong', ?)",
    [planned.startedAt, planned.endedAt, planned.name, planned.notes, planned.sourceKey],
  ).lastInsertRowId;

  for (const plannedExercise of planned.exercises) {
    const entryId = db.run('INSERT INTO workoutExercise (workoutId, exerciseId, position, notes) VALUES (?, ?, ?, ?)', [
      workoutId,
      exerciseId(plannedExercise.name),
      plannedExercise.position,
      plannedExercise.notes,
    ]).lastInsertRowId;

    for (const plannedSet of plannedExercise.sets) {
      db.run(
        `INSERT INTO workoutSet
           (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, durationSeconds, distanceMeters, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryId,
          plannedSet.position,
          plannedSet.kind,
          plannedSet.weightKilograms,
          plannedSet.entryUnit,
          plannedSet.reps,
          plannedSet.rpe,
          plannedSet.durationSeconds,
          plannedSet.distanceMeters,
          plannedSet.notes,
        ],
      );
      counters.setsAdded += 1;
    }
  }
}
