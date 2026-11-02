import { HardSetPolicy, isHardSet } from '../analytics/HardSets';
import type { Database } from '../db/Database';
import { MUSCLES, type Muscle } from '../library/Muscle';
import { AnalyticsHistory } from './AnalyticsHistory';

/** An exercise's fractional sets and percentage of one muscle's total. */
export interface ExerciseShare {
  readonly exerciseId: number;
  readonly name: string;
  readonly sets: number;
  readonly percent: number;
}

/** A muscle's selected-period average fractional hard sets per touched calendar week. */
export interface MuscleCoverageItem {
  readonly muscle: Muscle;
  readonly setsPerWeek: number;
}

/** Selected-period fractional sets and exercise contributions. */
export interface MuscleCoverageResult {
  readonly muscles: readonly MuscleCoverageItem[];
  readonly shares: Readonly<Partial<Record<Muscle, readonly ExerciseShare[]>>>;
}

/** Heuristic: Monday weeks touched by the selected inclusive local dates define the denominator. */
const Calendar = Object.freeze({ daysPerWeek: 7, millisecondsPerDay: 86_400_000, percent: 100 });
function monday(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % Calendar.daysPerWeek));
  return result;
}

/** Fractional hard sets and shares in inclusive local dates; report §12, item 10. */
export function muscleCoverage(db: Database, from: Date, to: Date, folderId?: number): MuscleCoverageResult {
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
  const rows = AnalyticsHistory.sets(db, start, end, folderId);
  const associations = AnalyticsHistory.muscles(db);
  const names = AnalyticsHistory.exercises(db);
  const totals = new Map<Muscle, number>();
  const exercises = new Map<Muscle, Map<number, { name: string; sets: number }>>();
  for (const row of rows) {
    if (!isHardSet({ ...row, isCompleted: true })) continue;
    for (const association of associations.get(row.exerciseId) ?? []) {
      const amount = association.role === 'primary' ? HardSetPolicy.primaryWeight : HardSetPolicy.secondaryWeight;
      const muscle = association.muscle;
      totals.set(muscle, (totals.get(muscle) ?? 0) + amount);
      const items = exercises.get(muscle) ?? new Map<number, { name: string; sets: number }>();
      items.set(row.exerciseId, {
        name: names.get(row.exerciseId)?.name ?? '',
        sets: (items.get(row.exerciseId)?.sets ?? 0) + amount,
      });
      exercises.set(muscle, items);
    }
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
