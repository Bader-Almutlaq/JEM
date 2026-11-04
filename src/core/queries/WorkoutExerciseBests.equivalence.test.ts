import { afterEach, beforeEach, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { ColdAnalyticsFixture } from './fixtures/ColdAnalyticsFixture';
import { workoutExerciseBests } from './WorkoutExerciseBests';

let database: Database;
beforeEach(async () => {
  database = await Database.openInMemory();
  migrate(database);
  ColdAnalyticsFixture.seed(database);
});
afterEach(() => database.close());

// The previous query, kept only as an equivalence oracle: it ranked every set before filtering by workout.
function previousRows(db: Database, workoutIds?: readonly number[]): readonly unknown[] {
  const scope = workoutIds === undefined ? '' : `AND w.id IN (${workoutIds.map(() => '?').join(', ')})`;
  return db.all<Record<string, unknown>>(
    `
    WITH ranked AS (
      SELECT s.workoutExerciseId AS entryId, s.weightKilograms, s.reps, s.durationSeconds, s.rpe, s.entryUnit,
             ROW_NUMBER() OVER (
               PARTITION BY s.workoutExerciseId
               ORDER BY s.weightKilograms DESC, s.reps DESC, COALESCE(s.durationSeconds, 0) DESC, s.position
             ) AS place,
             COUNT(*) OVER (PARTITION BY s.workoutExerciseId) AS setCount
      FROM workoutSet s
      WHERE s.kind <> 'warmup'
    )
    SELECT we.workoutId, we.exerciseId, e.name, e.tracking, r.setCount,
           r.weightKilograms, r.reps, r.durationSeconds, r.rpe, r.entryUnit
    FROM ranked r
    JOIN workoutExercise we ON we.id = r.entryId
    JOIN exercise e ON e.id = we.exerciseId
    JOIN workout w ON w.id = we.workoutId
    WHERE r.place = 1 AND w.isInProgress = 0 ${scope}
    ORDER BY we.workoutId, we.position
    `,
    workoutIds === undefined ? [] : [...workoutIds],
  );
}

function currentRows(db: Database, workoutIds?: readonly number[]): readonly unknown[] {
  return [...workoutExerciseBests(db, workoutIds).values()].flat().map((entry) => ({
    workoutId: entry.workoutId,
    exerciseId: entry.exerciseId,
    name: entry.name,
    tracking: entry.tracking,
    setCount: entry.setCount,
    ...entry.best,
  }));
}

test('the filtered ranking returns exactly what the whole-history ranking returned', () => {
  const all = previousRows(database);
  expect(all.length).toBeGreaterThan(0);
  expect(currentRows(database)).toEqual(all);
});

test('restricting to some workouts matches too, and an unfinished workout never appears', () => {
  const ids = database.all<{ id: number }>('SELECT id FROM workout ORDER BY id').map((row) => row.id);
  const live = database.value<number>('SELECT id FROM workout WHERE isInProgress = 1');
  if (live === undefined) throw new Error('The fixture should hold an unfinished workout');
  const some = [...ids.filter((_, index) => index % 2 === 0), live];
  expect(currentRows(database, some)).toEqual(previousRows(database, some));
  expect(currentRows(database, [live])).toEqual([]);
});
