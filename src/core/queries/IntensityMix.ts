import { PercentOfMax } from '../analytics/PercentOfMax';
import { estimatedOneRepMax } from '../analytics/EstimatedOneRepMax';
import { isHardSet } from '../analytics/HardSets';
import type { Database } from '../db/Database';
import type { Muscle } from '../library/Muscle';
import { AnalyticsHistory } from './AnalyticsHistory';
import { localDateKey } from '../support/localDate';
import { ExerciseStrength } from './ExerciseStrength';

/** A labelled count and percentage of its distribution. */
export interface IntensityBucket {
  readonly label: string;
  readonly count: number;
  readonly percent: number;
  /** Corresponding RPE label for effort buckets, when applicable. */
  readonly rpeLabel?: string;
}
/** Working-set rep and effort distributions and percentage of maximum. */
export interface IntensityMixResult {
  readonly reps: readonly IntensityBucket[];
  readonly effort: readonly IntensityBucket[];
  readonly notLogged: number;
  readonly percentOfMax: readonly IntensityBucket[];
}
/** Report §12 buckets; 31+ preserves higher-repetition sets, and percentages are descriptive. */
const policy = Object.freeze({
  repEnds: [5, 10, 15, 30, Infinity],
  percent: 100,
  maximumRpe: 10,
  intensityEnds: [60, 70, 80, 90, Infinity],
});
function buckets(labels: readonly string[], counts: readonly number[]): IntensityBucket[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return labels.map((label, index) => ({
    label,
    count: counts[index] ?? 0,
    percent: total === 0 ? 0 : ((counts[index] ?? 0) / total) * policy.percent,
  }));
}
/**
 * Finished completed non-warm-up sets over inclusive local dates. Report §12: hard-set rep buckets,
 * RIR = 10 − RPE, and intensity = load / exercise e1RM trend × 100. Percentage of maximum uses no future trend.
 */
export function intensityMix(
  db: Database,
  from: Date,
  to: Date,
  muscle?: Muscle,
  folderId?: number,
): IntensityMixResult {
  const repCounts = [0, 0, 0, 0, 0];
  const effortCounts = [0, 0, 0, 0, 0, 0];
  let notLogged = 0;
  const percentCounts = [0, 0, 0, 0, 0];
  if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from <= to) {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    const associations = AnalyticsHistory.muscles(db);
    const exercises = AnalyticsHistory.exercises(db);
    const rows = AnalyticsHistory.sets(db, start, end, folderId).filter(
      (row) =>
        row.kind !== 'warmup' &&
        (muscle === undefined ||
          associations.get(row.exerciseId)?.some((item) => item.muscle === muscle && item.role === 'primary')),
    );
    const trends = new Map<number, ReturnType<typeof ExerciseStrength.series>['trend']>();
    const bests = new Map<string, number>();
    for (const row of rows) {
      const exercise = exercises.get(row.exerciseId);
      if (exercise === undefined) continue;
      const estimate = estimatedOneRepMax(row, exercise);
      const key = `${row.exerciseId}:${row.workoutId}`;
      if (estimate !== null) bests.set(key, Math.max(bests.get(key) ?? 0, estimate.e1rmKilograms));
    }
    for (const row of rows) {
      if (row.rpe === null) notLogged += 1;
      else {
        const bucket = Math.min(5, Math.max(0, Math.floor(policy.maximumRpe - row.rpe)));
        effortCounts[bucket] = (effortCounts[bucket] ?? 0) + 1;
      }
      if (!isHardSet({ ...row, isCompleted: true })) continue;
      if (Number.isInteger(row.reps) && row.reps > 0) {
        const index = policy.repEnds.findIndex((limit) => row.reps <= limit);
        repCounts[index] = (repCounts[index] ?? 0) + 1;
      }
      if (exercises.get(row.exerciseId)?.tracking !== 'weight-reps' || row.weightKilograms <= 0) continue;
      let trend = trends.get(row.exerciseId);
      if (trend === undefined) {
        trend = ExerciseStrength.series(db, row.exerciseId, new Date(end.getTime() - 1)).trend;
        trends.set(row.exerciseId, trend);
      }
      const date = localDateKey(row.startedAt);
      // Binary search also preserves the no-future-trend rule if local dates repeat or move backwards.
      let low = 0;
      let high = trend.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const point = trend[middle];
        if (point !== undefined && point.date <= date) low = middle + 1;
        else high = middle;
      }
      const estimate = trend[low - 1];
      const percentage = PercentOfMax(
        row.weightKilograms,
        estimate?.e1rmKilograms ?? null,
        bests.get(`${row.exerciseId}:${row.workoutId}`) ?? null,
      );
      if (percentage !== null) {
        const index = policy.intensityEnds.findIndex((limit) => percentage < limit);
        percentCounts[index] = (percentCounts[index] ?? 0) + 1;
      }
    }
  }
  return {
    reps: buckets(['1–5', '6–10', '11–15', '16–30', '31+'], repCounts),
    effort: buckets(['0', '1', '2', '3', '4', '5+'], effortCounts).map((bucket, index) => ({
      ...bucket,
      rpeLabel: index === 5 ? '≤5' : String(policy.maximumRpe - index),
    })),
    notLogged,
    percentOfMax: buckets(['<60%', '60–70%', '70–80%', '80–90%', '≥90%'], percentCounts),
  };
}
