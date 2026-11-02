import { MuscleDashboard as currentMuscleDashboard } from './MuscleDashboard';
import { MuscleDetail as currentMuscleDetail } from './MuscleDashboard';
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
import { HardSetPolicy } from '../analytics/HardSets';
import { Database } from '../db/Database';
import type { Muscle } from '../library/Muscle';
import { intensityMix } from './IntensityMix';
import { LiftTrends, medianLiftChange, type LiftTrend } from './LiftTrends';
import { muscleCoverage, type ExerciseShare } from './MuscleCoverage';
import { weeklyMuscleVolume } from './WeeklyMuscleVolume';
import { WeeklyEffort } from './WeeklyEffort';

/** Selected-period muscle summary, including direct logged effort and primary-lift strength. */
interface MuscleDashboardItem {
  readonly muscle: Muscle;
  readonly setsPerWeek: number;
  readonly strengthChangePercent: number | null;
  readonly averageRir: number | null;
  readonly shares: readonly ExerciseShare[];
}

/** Inclusive local-date muscle summaries; fractional sets use the same window as strength and effort. */
function referenceMuscleDashboard(db: Database, from: Date, to: Date, folderId?: number): MuscleDashboardItem[] {
  const coverage = muscleCoverage(db, from, to, folderId);
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const lifts = LiftTrends(db, from, end, folderId);
  const primary = db.all<{ muscle: Muscle; exerciseId: number }>(
    "SELECT muscleId AS muscle, exerciseId FROM exerciseMuscle WHERE role = 'primary'",
  );
  return coverage.muscles
    .map((item) => {
      const ids = new Set(primary.filter((row) => row.muscle === item.muscle).map((row) => row.exerciseId));
      const effort = db.get<{ total: number | null; count: number }>(
        `
      SELECT SUM(? - s.rpe) AS total, COUNT(*) AS count FROM workout w
      JOIN workoutExercise we ON we.workoutId = w.id JOIN workoutSet s ON s.workoutExerciseId = we.id
      JOIN exerciseMuscle em ON em.exerciseId = we.exerciseId AND em.role = 'primary' AND em.muscleId = ?
      WHERE w.isInProgress = 0 AND s.isCompleted = 1 AND s.kind != 'warmup' AND s.rpe IS NOT NULL
        AND w.startedAt >= ? AND w.startedAt < ?
        AND (? IS NULL OR w.templateId IN (SELECT id FROM template WHERE folderId = ?))
    `,
        [
          HardSetPolicy.maximumRpe,
          item.muscle,
          new Date(from.getFullYear(), from.getMonth(), from.getDate()).toISOString(),
          end.toISOString(),
          folderId ?? null,
          folderId ?? null,
        ],
      );
      return {
        muscle: item.muscle,
        setsPerWeek: item.setsPerWeek,
        strengthChangePercent: medianLiftChange(lifts.filter((lift) => ids.has(lift.id))),
        averageRir:
          effort === undefined || effort.count === 0 || effort.total === null ? null : effort.total / effort.count,
        shares: coverage.shares[item.muscle] ?? [],
      };
    })
    .sort((a, b) => b.setsPerWeek - a.setsPerWeek || a.muscle.localeCompare(b.muscle));
}

/** Detail combines selected muscle's weekly fractional sets, exercise shares, strength and distributions. */
function referenceMuscleDetail(db: Database, from: Date, to: Date, muscle: Muscle) {
  const summary = referenceMuscleDashboard(db, from, to).find((item) => item.muscle === muscle);
  const ids = new Set(
    db
      .all<{ exerciseId: number }>("SELECT exerciseId FROM exerciseMuscle WHERE muscleId = ? AND role = 'primary'", [
        muscle,
      ])
      .map((row) => row.exerciseId),
  );
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const strength: readonly LiftTrend[] = LiftTrends(db, from, end).filter((lift) => ids.has(lift.id));
  // Occupancy is about finished sessions, even when none trained this muscle or contained a hard set.
  const loggedWeeks = new Set(WeeklyEffort(db, from, to).map((week) => week.weekStart));
  return {
    summary: summary ?? null,
    weekly: weeklyMuscleVolume(db, from, to, undefined, true)
      .filter((week) => loggedWeeks.has(week.weekStart))
      .map((week) => ({
        weekStart: week.weekStart,
        muscle: week.muscles.find((item) => item.muscle === muscle) ?? null,
      })),
    strength,
    mix: intensityMix(db, from, to, muscle),
    effort: WeeklyEffort(db, from, to, muscle),
  };
}

test('dashboard equals the previous per-muscle effort SQL, including deload and unknown effort', () => {
  for (const folder of [undefined, 1, 2, 99]) {
    expect(currentMuscleDashboard(database, from, to, folder)).toEqual(
      referenceMuscleDashboard(database, from, to, folder),
    );
  }
});

test('detail equals the previous composition for direct, indirect and untrained muscles', () => {
  for (const muscle of ['chest', 'triceps', 'calves'] as const) {
    expect(currentMuscleDetail(database, from, to, muscle)).toEqual(referenceMuscleDetail(database, from, to, muscle));
  }
});
