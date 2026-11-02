import { Database } from '../db/Database';
import { fromWorkoutExerciseRow, type WorkoutExercise, type WorkoutExerciseRow } from '../models/WorkoutExercise';
import { previousExerciseEntryBefore } from './PreviousPerformance';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { ColdAnalyticsFixture } from './fixtures/ColdAnalyticsFixture';
import { migrate } from '../db/migrations';

let database: Database;
beforeEach(async () => {
  database = await Database.openInMemory();
  migrate(database);
  ColdAnalyticsFixture.seed(database);
});
afterEach(() => database.close());

const to = new Date(2024, 5, 12);

function referencePreviousExerciseEntryBefore(
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

test('predecessor IN lookup equals the previous EXISTS lookup across occurrences, brands and date ties', () => {
  for (const exerciseId of [1, 2, 3, 99]) {
    for (const occurrence of [0, 1, 2]) {
      for (const machine of [null, 'synthetic', 'Other']) {
        for (const current of [
          { exerciseId, occurrence, workoutId: 2, startedAt: '2024-01-01T17:00:00Z' },
          { exerciseId, occurrence, workoutId: null, startedAt: to.toISOString() },
          { exerciseId, occurrence, workoutId: 1, startedAt: '2024-01-01T09:00:00Z' },
        ]) {
          expect(previousExerciseEntryBefore(database, current, machine)).toEqual(
            referencePreviousExerciseEntryBefore(database, current, machine),
          );
        }
      }
    }
  }
});
