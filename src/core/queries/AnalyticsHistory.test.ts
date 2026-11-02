import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { AnalyticsHistory } from './AnalyticsHistory';
import { ColdAnalyticsFixture } from './fixtures/ColdAnalyticsFixture';
import { muscleCoverage } from './MuscleCoverage';
import { weeklyMuscleVolume } from './WeeklyMuscleVolume';
import { MuscleDashboard } from './MuscleDashboard';
import { intensityMix } from './IntensityMix';

let db: Database;
const from = new Date(2024, 0, 1);
const to = new Date(2024, 5, 30);
const end = new Date(2024, 6, 1);

beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
  ColdAnalyticsFixture.seed(db);
});
afterEach(() => db.close());

test('period sections share one set read, with no row multiplication across muscles', () => {
  const reads = vi.spyOn(db, 'all');
  muscleCoverage(db, from, to);
  weeklyMuscleVolume(db, from, to, undefined, true);
  MuscleDashboard(db, from, to);
  intensityMix(db, from, to);
  const sharedReads = reads.mock.calls.filter(([sql]) =>
    sql.includes('SELECT w.id AS workoutId, w.startedAt, we.exerciseId'),
  );
  expect(sharedReads).toHaveLength(1);
  const sets = AnalyticsHistory.sets(db, from, end);
  expect(sets.length).toBe(
    db.value<number>(
      `
    SELECT COUNT(*) FROM workout w
    JOIN workoutExercise we ON we.workoutId = w.id
    JOIN workoutSet s ON s.workoutExerciseId = we.id
    WHERE w.isInProgress = 0 AND s.isCompleted = 1 AND w.startedAt >= ? AND w.startedAt < ?
  `,
      [from.toISOString(), end.toISOString()],
    ),
  );
  expect(AnalyticsHistory.sets(db, from, end)).toBe(sets);
});

test('sets, metadata and associations invalidate together after edits, with distinct range and plan keys', () => {
  const sets = AnalyticsHistory.sets(db, from, end);
  const muscles = AnalyticsHistory.muscles(db);
  const exercises = AnalyticsHistory.exercises(db);
  expect(AnalyticsHistory.sets(db, from, end, 1)).not.toBe(sets);
  expect(AnalyticsHistory.sets(db, from, to)).not.toBe(sets);
  db.exec(`
    UPDATE workoutSet SET weightKilograms = 123 WHERE workoutExerciseId = 1;
    UPDATE exercise SET name = 'Renamed synthetic press' WHERE id = 1;
    UPDATE exerciseMuscle SET role = 'primary' WHERE exerciseId = 1 AND muscleId = 'triceps';
  `);
  expect(AnalyticsHistory.sets(db, from, end)).not.toBe(sets);
  expect(AnalyticsHistory.sets(db, from, end).find((set) => set.exerciseId === 1)?.weightKilograms).toBe(123);
  expect(AnalyticsHistory.muscles(db)).not.toBe(muscles);
  expect(AnalyticsHistory.muscles(db).get(1)).toContainEqual(
    expect.objectContaining({ muscle: 'triceps', role: 'primary' }),
  );
  expect(AnalyticsHistory.exercises(db)).not.toBe(exercises);
  expect(AnalyticsHistory.exercises(db).get(1)?.name).toBe('Renamed synthetic press');
});
