import { HardSetPolicy } from '../analytics/HardSets';
import type { Database } from '../db/Database';
import type { Muscle } from '../library/Muscle';
import { intensityMix } from './IntensityMix';
import { AnalyticsHistory } from './AnalyticsHistory';
import { LiftTrends, medianLiftChange, type LiftTrend } from './LiftTrends';
import { muscleCoverage, type ExerciseShare } from './MuscleCoverage';
import { weeklyMuscleVolume } from './WeeklyMuscleVolume';
import { WeeklyEffort } from './WeeklyEffort';

/** Selected-period muscle summary, including direct logged effort and primary-lift strength. */
export interface MuscleDashboardItem {
  readonly muscle: Muscle;
  readonly setsPerWeek: number;
  readonly strengthChangePercent: number | null;
  readonly averageRir: number | null;
  readonly shares: readonly ExerciseShare[];
}

/** Inclusive local-date muscle summaries; fractional sets use the same window as strength and effort. */
export function MuscleDashboard(db: Database, from: Date, to: Date, folderId?: number): MuscleDashboardItem[] {
  const coverage = muscleCoverage(db, from, to, folderId);
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const lifts = muscleLifts(db, from, end, folderId);
  const associations = AnalyticsHistory.muscles(db);
  const primary = new Map<Muscle, Set<number>>();
  for (const [exerciseId, muscles] of associations) {
    for (const { muscle, role } of muscles) {
      if (role !== 'primary') continue;
      const ids = primary.get(muscle) ?? new Set<number>();
      ids.add(exerciseId);
      primary.set(muscle, ids);
    }
  }
  const effort = new Map<Muscle, { total: number; count: number }>();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (const row of AnalyticsHistory.sets(db, start, end, folderId)) {
    if (row.kind === 'warmup' || row.rpe === null) continue;
    for (const { muscle, role } of associations.get(row.exerciseId) ?? []) {
      if (role !== 'primary') continue;
      const total = effort.get(muscle) ?? { total: 0, count: 0 };
      total.total += HardSetPolicy.maximumRpe - row.rpe;
      total.count += 1;
      effort.set(muscle, total);
    }
  }
  return coverage.muscles
    .map((item) => {
      const ids = primary.get(item.muscle) ?? new Set<number>();
      const logged = effort.get(item.muscle);
      return {
        muscle: item.muscle,
        setsPerWeek: item.setsPerWeek,
        strengthChangePercent: medianLiftChange(lifts.filter((lift) => ids.has(lift.id))),
        averageRir: logged === undefined ? null : logged.total / logged.count,
        shares: coverage.shares[item.muscle] ?? [],
      };
    })
    .sort((a, b) => b.setsPerWeek - a.setsPerWeek || a.muscle.localeCompare(b.muscle));
}

/** Detail combines selected muscle's weekly fractional sets, exercise shares, strength and distributions. */
export function MuscleDetail(db: Database, from: Date, to: Date, muscle: Muscle) {
  const summary = MuscleDashboard(db, from, to).find((item) => item.muscle === muscle);
  const ids = new Set(
    [...AnalyticsHistory.muscles(db)]
      .filter(([, associations]) => associations.some((item) => item.muscle === muscle && item.role === 'primary'))
      .map(([exerciseId]) => exerciseId),
  );
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const strength: readonly LiftTrend[] = muscleLifts(db, from, end).filter((lift) => ids.has(lift.id));
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

function muscleLifts(db: Database, from: Date, end: Date, folderId?: number): readonly LiftTrend[] {
  // Summary and detail need the same lift calculations within this version, including the exact time window.
  return db.cache.get('MuscleDashboard.lifts', [from.toISOString(), end.toISOString(), folderId], () =>
    LiftTrends(db, from, end, folderId),
  );
}
