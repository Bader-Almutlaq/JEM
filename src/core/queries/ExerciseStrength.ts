import { ExerciseSeries } from './ExerciseSeries';
import { historyBoundaryKey } from './HistoryBoundary';
import { localDateKey } from '../support/localDate';
import { estimatedOneRepMax } from '../analytics/EstimatedOneRepMax';
import { strengthTrend } from '../analytics/StrengthTrend';
import type { Database } from '../db/Database';
import type { WorkoutSet } from '../models/WorkoutSet';

/** One day's best qualifying estimate in kg and its original, unrounded set. */
export interface ExerciseStrengthSession {
  readonly workoutId: number;
  /** Calendar day in the phone's time zone, YYYY-MM-DD (`localDateKey`), like History and the calendar. */
  readonly date: string;
  readonly e1rmKilograms: number;
  readonly bestSet: Pick<WorkoutSet, 'weightKilograms' | 'reps' | 'rpe'>;
}

/** Raw daily maxima and smoothed kg, oldest first; missing estimates/rates are null, never zero. */
export interface ExerciseStrengthSeries {
  readonly sessions: readonly ExerciseStrengthSession[];
  readonly trend: readonly { readonly date: string; readonly e1rmKilograms: number }[];
  /** Latest smoothed e1RM in kg, including a held (unchanged) final point. */
  readonly latest: number | null;
  readonly changePerWeekPercent: number | null;
}

interface WeightedSession extends ExerciseStrengthSession {
  readonly trendWeight: number;
}

/**
 * Read-only strength history for finished, completed sets through `now`.
 * Report, "The recommended algorithms, in one place", items 1, 2 and 4.
 * Daily maxima include repeated exercise entries and multiple workouts; workoutId
 * identifies the winning set's workout. Ties keep the first logged set. Raw held
 * outliers remain in sessions; the trend holds them until a future confirmation
 * flow exists. Missing exercises/metadata or no qualifying sets return empty data.
 */
function series(db: Database, exerciseId: number, now: Date): ExerciseStrengthSeries {
  // The result depends on the history read and on today's date only, so it is shared until the next write.
  const key = [exerciseId, historyBoundaryKey(db, now), localDateKey(now)];
  return db.cache.get('ExerciseStrength.series', key, () => uncachedSeries(db, exerciseId, now));
}

function uncachedSeries(db: Database, exerciseId: number, now: Date): ExerciseStrengthSeries {
  const days = new Map<string, WeightedSession>();
  // The shared cached history holds the same finished, completed sets in the same logging order.
  const history = ExerciseSeries.read(db, exerciseId, now);
  const exercise = history.exercise;
  if (exercise !== null) {
    for (const session of history.sessions) {
      for (const set of session.sets) {
        const estimate = estimatedOneRepMax(set, exercise);
        if (estimate === null) continue;
        const date = localDateKey(session.date);
        const previous = days.get(date);
        if (previous !== undefined && previous.e1rmKilograms >= estimate.e1rmKilograms) continue;
        days.set(date, {
          workoutId: session.workoutId,
          date,
          e1rmKilograms: estimate.e1rmKilograms,
          bestSet: { weightKilograms: set.weightKilograms, reps: set.reps, rpe: set.rpe },
          trendWeight: estimate.trendWeight,
        });
      }
    }
  }
  const sessions = [...days.values()];
  // Sessions use civil dates indexed at UTC midnight. Compare against today's civil date too:
  // east of UTC, today's label can otherwise appear to be in the future just after midnight.
  const today = new Date(`${localDateKey(now)}T00:00:00.000Z`);
  const result = strengthTrend(sessions, today);
  return {
    sessions: sessions.map(({ workoutId, date, e1rmKilograms, bestSet }) => ({
      workoutId,
      date,
      e1rmKilograms,
      bestSet,
    })),
    trend: result.trend.map(({ date, e1rmKilograms }) => ({ date, e1rmKilograms })),
    latest: result.latest,
    changePerWeekPercent: result.changePerWeekPercent,
  };
}

/** Read-only daily exercise strength query; formulas are owned by the pure analytics functions. */
export const ExerciseStrength = { series } as const;
