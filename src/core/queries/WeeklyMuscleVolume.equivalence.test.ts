import { weeklyMuscleVolume as currentWeeklyMuscleVolume } from './WeeklyMuscleVolume';
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
import { localDateKey } from '../support/localDate';
import { HardSetPolicy } from '../analytics/HardSets';
import { muscleVolume, type MuscleVolume, type MuscleVolumeSet } from '../analytics/MuscleVolume';
import { Database } from '../db/Database';

/** The Monday local date and fractional hard sets for all muscles, including muscles with zero sets. */
interface WeeklyMuscleVolume {
  readonly weekStart: string;
  readonly muscles: readonly MuscleVolume[];
}

/** Heuristic: civil-calendar constants for Monday-based weeks, matching the History calendar's local dates. */
const CalendarWeek = Object.freeze({ days: 7, monday: 1, sunday: 0 });

/** An invalid date prevents a local calendar week from being selected. */
class WeeklyMuscleVolumeError extends Error {
  readonly kind = 'invalidDate';

  /** Ask for valid range endpoints before reading the database. */
  constructor() {
    super('Choose valid start and end dates for weekly muscle volume.');
    this.name = 'WeeklyMuscleVolumeError';
  }
}

function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = monday.getDay();
  monday.setDate(
    monday.getDate() - (weekday === CalendarWeek.sunday ? CalendarWeek.days : weekday) + CalendarWeek.monday,
  );
  return monday;
}

/**
 * Finished workouts grouped by their start's local Monday week, from the week containing `from`
 * through the week containing `to`, inclusive. Returns zero-filled weeks and muscles; a reversed
 * range returns []. Calendar increments preserve local weeks across daylight-saving changes.
 * When clipToDates is true, partial weeks include only the inclusive selected dates.
 * Imported workouts without an end/completion timestamp still count; planned sets never count.
 * Fractional counting and zones are delegated to muscleVolume (research report, item 10).
 */
function referenceWeeklyMuscleVolume(
  db: Database,
  from: Date,
  to: Date,
  secondaryWeight: number = HardSetPolicy.secondaryWeight,
  clipToDates: boolean = false,
): WeeklyMuscleVolume[] {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new WeeklyMuscleVolumeError();
  if (from > to) return [];
  const firstMonday = mondayOf(from);
  const lastMonday = mondayOf(to);
  const end = new Date(lastMonday);
  end.setDate(end.getDate() + CalendarWeek.days);
  const queryStart = clipToDates ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : firstMonday;
  const queryEnd = clipToDates ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : end;
  const rows = db.all<Omit<MuscleVolumeSet, 'isCompleted'> & { startedAt: string; isCompleted: number }>(
    `
      SELECT w.id AS workoutId, w.startedAt, em.muscleId AS muscle, em.role,
             s.kind, s.rpe, s.isCompleted
      FROM workout w
      JOIN workoutExercise we ON we.workoutId = w.id
      JOIN workoutSet s ON s.workoutExerciseId = we.id
      JOIN exerciseMuscle em ON em.exerciseId = we.exerciseId
      WHERE w.isInProgress = 0 AND w.startedAt >= ? AND w.startedAt < ?
      ORDER BY w.startedAt, w.id, we.position, s.position
    `,
    [queryStart.toISOString(), queryEnd.toISOString()],
  );
  const weeks = new Map<string, MuscleVolumeSet[]>();
  for (const row of rows) {
    const weekStart = localDateKey(mondayOf(new Date(row.startedAt)));
    const sets = weeks.get(weekStart) ?? [];
    sets.push({ ...row, isCompleted: row.isCompleted === 1 });
    weeks.set(weekStart, sets);
  }
  const result: WeeklyMuscleVolume[] = [];
  for (
    const monday = new Date(firstMonday);
    monday <= lastMonday;
    monday.setDate(monday.getDate() + CalendarWeek.days)
  ) {
    const weekStart = localDateKey(monday);
    result.push({ weekStart, muscles: muscleVolume(weeks.get(weekStart) ?? [], secondaryWeight) });
  }
  return result;
}

test('weekly volume equals the previous association rows, including clipped weeks and secondary weights', () => {
  for (const weight of [0, 0.3, 0.5, 1]) {
    for (const clipped of [false, true]) {
      expect(currentWeeklyMuscleVolume(database, from, to, weight, clipped)).toEqual(
        referenceWeeklyMuscleVolume(database, from, to, weight, clipped),
      );
    }
  }
  expect(currentWeeklyMuscleVolume(database, to, from)).toEqual(referenceWeeklyMuscleVolume(database, to, from));
  expect(() => currentWeeklyMuscleVolume(database, from, to, -1)).toThrow('secondary-muscle weight');
  expect(() => referenceWeeklyMuscleVolume(database, from, to, -1)).toThrow('secondary-muscle weight');
  expect(() => currentWeeklyMuscleVolume(database, new Date(NaN), to)).toThrow('valid start and end dates');
  expect(() => referenceWeeklyMuscleVolume(database, new Date(NaN), to)).toThrow(WeeklyMuscleVolumeError);
});
