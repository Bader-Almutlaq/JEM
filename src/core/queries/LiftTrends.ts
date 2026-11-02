import { estimatedOneRepMax } from '../analytics/EstimatedOneRepMax';
import { strengthTrend, type StrengthTrendPoint } from '../analytics/StrengthTrend';
import { medianStrengthChange, strengthChangeCounts, strengthIndex } from '../analytics/StrengthIndex';
import type { Database } from '../db/Database';
import type { WeightUnit } from '../units/WeightUnit';
import { ExerciseSeries } from './ExerciseSeries';

/** A lift's smoothed estimates in kg and change over its qualifying observations. */
export interface LiftTrend {
  readonly id: number;
  readonly name: string;
  readonly unit: WeightUnit;
  readonly sessions: number;
  readonly latest: number;
  readonly changePercent: number;
  readonly mixedMachines: boolean;
  readonly points: readonly number[];
  readonly weeksSinceBest?: number;
}

/** Heuristic: at least two qualifying non-deload sessions inside the period establish a comparison. */
export const LiftTrendPolicy = Object.freeze({
  minimumSessions: 2,
  percent: 100,
  daysPerWeek: 7,
  millisecondsPerDay: 86_400_000,
  staleWeeks: 6,
});

interface DatedLiftTrend {
  readonly lift: LiftTrend;
  readonly trend: readonly StrengthTrendPoint[];
}

function readLiftTrends(db: Database, from: Date, to: Date, folderId?: number): readonly DatedLiftTrend[] {
  const ids = db.all<{ id: number }>(
    `
      SELECT DISTINCT e.id
      FROM exercise e
      JOIN workoutExercise we ON we.exerciseId = e.id
      JOIN workout w ON w.id = we.workoutId
      WHERE e.tracking = 'weight-reps'
        AND w.isInProgress = 0
        AND w.startedAt >= ? AND w.startedAt < ?
        AND (? IS NULL OR w.templateId IN (SELECT id FROM template WHERE folderId = ?))
    `,
    [from.toISOString(), to.toISOString(), folderId ?? null, folderId ?? null],
  );
  const workoutIds =
    folderId === undefined
      ? null
      : new Set(
          db
            .all<{ id: number }>(
              `
                SELECT w.id
                FROM workout w
                JOIN template t ON t.id = w.templateId
                WHERE t.folderId = ?
              `,
              [folderId],
            )
            .map((row) => row.id),
        );
  const result: DatedLiftTrend[] = [];
  for (const { id } of ids) {
    const history = ExerciseSeries.read(db, id, to);
    const exercise = history.exercise;
    if (exercise === null) continue;
    const sessions = history.sessions.filter(
      (session) =>
        Date.parse(session.date) < to.getTime() &&
        session.deloadEntryIds.length === 0 &&
        (workoutIds === null || workoutIds.has(session.workoutId)),
    );
    const observations = sessions.flatMap((session) => {
      let best: ReturnType<typeof estimatedOneRepMax> = null;
      for (const set of session.sets) {
        if (session.deloadEntryIds.includes(set.workoutExerciseId)) continue;
        const estimate = estimatedOneRepMax(set, exercise);
        if (estimate !== null && (best === null || estimate.e1rmKilograms > best.e1rmKilograms)) best = estimate;
      }
      return best === null
        ? []
        : [{ date: session.date, e1rmKilograms: best.e1rmKilograms, trendWeight: best.trendWeight }];
    });
    const periodObservations = observations.filter((observation) => Date.parse(observation.date) >= from.getTime());
    if (periodObservations.length < LiftTrendPolicy.minimumSessions) continue;
    const trend = strengthTrend(observations, to);
    const first = trend.trend.filter((point) => Date.parse(point.date) <= from.getTime()).at(-1) ?? trend.trend[0];
    if (first === undefined || trend.latest === null) continue;
    const brands = new Set(
      sessions
        .filter((session) => Date.parse(session.date) >= from.getTime())
        .flatMap((session) =>
          session.machineEntries.flatMap((entry) =>
            entry.machineBrand === null ? [] : [entry.machineBrand.toLowerCase()],
          ),
        ),
    );
    let bestValue = 0;
    let bestDate = periodObservations[0]?.date ?? from.toISOString();
    for (const observation of observations) {
      if (observation.e1rmKilograms > bestValue) {
        bestValue = observation.e1rmKilograms;
        bestDate = observation.date;
      }
    }
    result.push({
      trend: trend.trend,
      lift: {
        id,
        weeksSinceBest: Math.max(
          0,
          Math.floor(
            (to.getTime() - new Date(bestDate).getTime()) /
              (LiftTrendPolicy.daysPerWeek * LiftTrendPolicy.millisecondsPerDay),
          ),
        ),
        name: exercise.name,
        unit: exercise.defaultEntryUnit,
        sessions: periodObservations.length,
        latest: trend.latest,
        changePercent: (trend.latest / first.e1rmKilograms - 1) * LiftTrendPolicy.percent,
        mixedMachines: brands.size > 1,
        points: [first, ...trend.trend.filter((point) => Date.parse(point.date) > Date.parse(first.date))].map(
          (point) => point.e1rmKilograms,
        ),
      },
    });
  }
  return result.sort((a, b) => b.lift.changePercent - a.lift.changePercent || a.lift.name.localeCompare(b.lift.name));
}

/** Session maxima feed the shared EWMA; change = (last / baseline − 1) × 100 (report §12).
 * Requires ≥2 non-deload sessions with qualifying estimates in [from, to), even when older history exists.
 * Baseline is the last trend at/before from, otherwise the first in-period trend. Deload sessions are excluded.
 */
export function LiftTrends(db: Database, from: Date, to: Date, folderId?: number): readonly LiftTrend[] {
  return readLiftTrends(db, from, to, folderId).map(({ lift }) => lift);
}

/** Median percentage change across ranked lifts; null when no lifts have sufficient history. */
export function medianLiftChange(lifts: readonly LiftTrend[]): number | null {
  return medianStrengthChange(lifts.map((lift) => lift.changePercent));
}

/** Counted lifts, typical change, direction counts and weekly relative strength; one history pass, end exclusive. */
export function strengthIndexReport(db: Database, from: Date, to: Date) {
  const dated = readLiftTrends(db, from, to);
  const lifts = dated.map(({ lift }) => lift);
  return {
    lifts,
    medianChangePercent: medianLiftChange(lifts),
    counts: strengthChangeCounts(lifts.map((lift) => lift.changePercent)),
    points: strengthIndex(
      dated.map(({ trend }) => trend),
      from,
      to,
    ),
  };
}
