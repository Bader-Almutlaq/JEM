import { muscleCoverage as currentMuscleCoverage } from './MuscleCoverage';
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

const from = new Date(2023, 11, 28);
const to = new Date(2024, 5, 12);

// Previous implementation retained only as an equivalence oracle.
import { HardSetPolicy, isHardSet, type HardSet } from '../analytics/HardSets';
import { Database } from '../db/Database';
import { MUSCLES, type Muscle } from '../library/Muscle';
import type { MuscleRole } from '../library/MuscleRole';

/** An exercise's fractional sets and percentage of one muscle's total. */
interface ExerciseShare {
  readonly exerciseId: number;
  readonly name: string;
  readonly sets: number;
  readonly percent: number;
}

/** A muscle's selected-period average fractional hard sets per touched calendar week. */
interface MuscleCoverageItem {
  readonly muscle: Muscle;
  readonly setsPerWeek: number;
}

/** Selected-period fractional sets and exercise contributions. */
interface MuscleCoverageResult {
  readonly muscles: readonly MuscleCoverageItem[];
  readonly shares: Readonly<Partial<Record<Muscle, readonly ExerciseShare[]>>>;
}

interface Row extends HardSet {
  readonly muscle: Muscle;
  readonly role: MuscleRole;
  readonly exerciseId: number;
  readonly name: string;
}

/** Heuristic: Monday weeks touched by the selected inclusive local dates define the denominator. */
const Calendar = Object.freeze({ daysPerWeek: 7, millisecondsPerDay: 86_400_000, percent: 100 });
function monday(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % Calendar.daysPerWeek));
  return result;
}

/** Fractional hard sets and shares in inclusive local dates; report §12, item 10. */
function referenceMuscleCoverage(db: Database, from: Date, to: Date, folderId?: number): MuscleCoverageResult {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to)
    return { muscles: [], shares: {} };
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const firstWeek = monday(from);
  const lastWeek = monday(to);
  const days =
    (Date.UTC(lastWeek.getFullYear(), lastWeek.getMonth(), lastWeek.getDate()) -
      Date.UTC(firstWeek.getFullYear(), firstWeek.getMonth(), firstWeek.getDate())) /
    Calendar.millisecondsPerDay;
  const weeks = Math.floor(days / Calendar.daysPerWeek) + 1;
  const rows = db
    .all<Omit<Row, 'isCompleted'> & { isCompleted: number }>(
      `
    SELECT s.kind, s.rpe, s.isCompleted, em.muscleId AS muscle, em.role, e.id AS exerciseId, e.name
    FROM workout w JOIN workoutExercise we ON we.workoutId = w.id
    JOIN exercise e ON e.id = we.exerciseId JOIN workoutSet s ON s.workoutExerciseId = we.id
    JOIN exerciseMuscle em ON em.exerciseId = e.id
    WHERE w.isInProgress = 0 AND w.startedAt >= ? AND w.startedAt < ?
      AND (? IS NULL OR w.templateId IN (SELECT id FROM template WHERE folderId = ?))
  `,
      [start.toISOString(), end.toISOString(), folderId ?? null, folderId ?? null],
    )
    .map((row) => ({ ...row, isCompleted: row.isCompleted === 1 }))
    .filter(isHardSet);
  const totals = new Map<Muscle, number>();
  const exercises = new Map<Muscle, Map<number, { name: string; sets: number }>>();
  for (const row of rows) {
    const amount = row.role === 'primary' ? HardSetPolicy.primaryWeight : HardSetPolicy.secondaryWeight;
    totals.set(row.muscle, (totals.get(row.muscle) ?? 0) + amount);
    const items = exercises.get(row.muscle) ?? new Map<number, { name: string; sets: number }>();
    items.set(row.exerciseId, { name: row.name, sets: (items.get(row.exerciseId)?.sets ?? 0) + amount });
    exercises.set(row.muscle, items);
  }
  const shares: Partial<Record<Muscle, ExerciseShare[]>> = {};
  for (const [muscle, items] of exercises) {
    const total = totals.get(muscle) ?? 0;
    shares[muscle] = [...items]
      .map(([exerciseId, item]) => ({ exerciseId, ...item, percent: (item.sets / total) * Calendar.percent }))
      .sort((a, b) => b.sets - a.sets);
  }
  return { muscles: MUSCLES.map((muscle) => ({ muscle, setsPerWeek: (totals.get(muscle) ?? 0) / weeks })), shares };
}

test('coverage equals the previous joined SQL on mixed history and current plan membership', () => {
  for (const folder of [undefined, 1, 2, 99]) {
    expect(currentMuscleCoverage(database, from, to, folder)).toEqual(
      referenceMuscleCoverage(database, from, to, folder),
    );
  }
  for (const [start, end] of [
    [to, from],
    [new Date(NaN), to],
    [new Date(2025, 0, 1), new Date(2025, 0, 2)],
  ]) {
    if (start === undefined || end === undefined) continue;
    expect(currentMuscleCoverage(database, start, end)).toEqual(referenceMuscleCoverage(database, start, end));
  }
});

test('equal exercise shares retain the previous order when dates and entry positions differ from insertion order', () => {
  database.exec(`
    DELETE FROM workout;
    INSERT INTO workout (id, name, source, startedAt, isInProgress) VALUES
      (1, 'Later first', 'app', '2024-01-03T12:00:00.000Z', 0),
      (2, 'Earlier second', 'app', '2024-01-02T12:00:00.000Z', 0);
    INSERT INTO workoutExercise (id, workoutId, exerciseId, position) VALUES (1, 1, 1, 0), (2, 2, 5, 0);
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, isCompleted)
    VALUES (1, 0, 'working', 20, 'kg', 8, 1), (2, 0, 'working', 20, 'kg', 8, 1);
  `);
  expect(currentMuscleCoverage(database, from, to)).toEqual(referenceMuscleCoverage(database, from, to));
});
