import { topWorkingSet } from '../logging/topWorkingSet';
import type { PersonalCurve } from '../analytics/PersonalCurve';
import { estimatedOneRepMax } from '../analytics/EstimatedOneRepMax';
import { strengthTrend, type StrengthObservation } from '../analytics/StrengthTrend';
import type { Database } from '../db/Database';
import type { WorkoutSet } from '../models/WorkoutSet';
import { isWorkSetKind } from '../models/SetKind';
import { ExerciseSeries } from './ExerciseSeries';

/** Owner's comparison interval (ANALYTICS.md). Percent uses the ordinary relative difference. */
const policy = Object.freeze({ previousSessions: 4, percent: 100 });

/** Exact external load in kg and logged reps/effort; bodyweight loads remain added load. */
export type ProgressTopSet = Pick<WorkoutSet, 'weightKilograms' | 'reps' | 'rpe'>;

/** One finished session, including repeated occurrences; missing e1RM/effort/top set stays null. */
export interface ExerciseProgressSession {
  readonly date: string;
  readonly workoutId: number;
  readonly isDeload: boolean;
  readonly bestEstimatedOneRepMax: number | null;
  readonly topSet: ProgressTopSet | null;
  readonly workingSetCount: number;
  readonly averageRpe: number | null;
}

/** Latest non-deload versus fourth previous non-deload; fewer than five sessions gives no changes. */
export interface ExerciseProgressChanges {
  readonly estimatedOneRepMaxPercent: number | null;
  readonly topSet: { readonly before: ProgressTopSet | null; readonly after: ProgressTopSet | null };
  readonly workingSetCount: { readonly before: number; readonly after: number };
}

/** Saved workout containing this exercise; weekday is ISO 1–7 or null. */
export interface ExerciseProgressWorkout {
  readonly id: number;
  readonly name: string;
  readonly weekday: number | null;
}

/** A qualifying source set and its session date, with load in kilograms. */
export interface ProgressEstimateSource {
  readonly date: string;
  readonly set: Pick<WorkoutSet, 'weightKilograms' | 'reps' | 'rpe' | 'kind'>;
}

/** Per-session progress in chronological order, one exercise and optional saved workout/machine. All loads in kg. */
export interface ExerciseProgressReport {
  readonly sessions: readonly ExerciseProgressSession[];
  readonly trendNow: number | null;
  readonly bestEstimate: { readonly value: number; readonly date: string } | null;
  readonly changes: ExerciseProgressChanges | null;
  readonly bestEstimateSource: ProgressEstimateSource | null;
  readonly latestEstimateSource: ProgressEstimateSource | null;
  readonly curve: PersonalCurve | null;
  readonly otherWorkouts: readonly ExerciseProgressWorkout[];
  readonly machineBrands: readonly (string | null)[];
}

/**
 * Read-only level-1 progress. e1RM/qualifications and EWMA delegate to their canonical owners (report items 1–4).
 * Heuristic: a session with any selected deload entry is a deload; deloads remain in raw charts/bests,
 * but are excluded from the headline trend and comparisons. Top-set ties use more reps, then logging order.
 * The personal curve always uses all finished exercise history, even when the displayed scope is narrower.
 */
export function ExerciseProgress(
  db: Database,
  exerciseId: number,
  now = new Date(),
  templateId?: number,
  machine?: string | null,
): ExerciseProgressReport {
  const all = ExerciseSeries.read(db, exerciseId, now, templateId);
  const history = machine === undefined ? all : ExerciseSeries.filterMachine(all, machine);
  const observations: StrengthObservation[] = [];
  let bestEstimate: ExerciseProgressReport['bestEstimate'] = null;
  let bestEstimateSource: ProgressEstimateSource | null = null;
  const sources: ProgressEstimateSource[] = [];
  const sessions = history.sessions.map((session): ExerciseProgressSession => {
    const work = session.sets.filter((set) => isWorkSetKind(set.kind));
    const topSet = topWorkingSet(work) ?? null;
    const effort = work.flatMap((set) => (set.rpe === null ? [] : [set.rpe]));
    let best: ReturnType<typeof estimatedOneRepMax> = null;
    let bestSet: WorkoutSet | null = null;
    for (const set of work) {
      const estimate = history.exercise === null ? null : estimatedOneRepMax(set, history.exercise);
      if (estimate !== null && (best === null || estimate.e1rmKilograms > best.e1rmKilograms)) {
        best = estimate;
        bestSet = set;
      }
    }
    const isDeload = session.deloadEntryIds.length > 0;
    if (best !== null) {
      if (!isDeload) {
        observations.push({ date: session.date, e1rmKilograms: best.e1rmKilograms, trendWeight: best.trendWeight });
        if (bestSet !== null)
          sources.push({
            date: session.date,
            set: { weightKilograms: bestSet.weightKilograms, reps: bestSet.reps, rpe: bestSet.rpe, kind: bestSet.kind },
          });
      }
      if (bestEstimate === null || best.e1rmKilograms > bestEstimate.value) {
        bestEstimate = { value: best.e1rmKilograms, date: session.date };
        if (bestSet !== null)
          bestEstimateSource = {
            date: session.date,
            set: { weightKilograms: bestSet.weightKilograms, reps: bestSet.reps, rpe: bestSet.rpe, kind: bestSet.kind },
          };
      }
    }
    return {
      date: session.date,
      workoutId: session.workoutId,
      isDeload,
      bestEstimatedOneRepMax: best?.e1rmKilograms ?? null,
      topSet: topSet === null ? null : { weightKilograms: topSet.weightKilograms, reps: topSet.reps, rpe: topSet.rpe },
      workingSetCount: work.length,
      averageRpe: effort.length === 0 ? null : effort.reduce((sum, rpe) => sum + rpe, 0) / effort.length,
    };
  });
  const normal = sessions.filter((session) => !session.isDeload);
  const after = normal.at(-1);
  const before = normal.at(-1 - policy.previousSessions);
  const changes =
    before === undefined || after === undefined
      ? null
      : {
          estimatedOneRepMaxPercent:
            before.bestEstimatedOneRepMax === null || after.bestEstimatedOneRepMax === null
              ? null
              : (after.bestEstimatedOneRepMax / before.bestEstimatedOneRepMax - 1) * policy.percent,
          topSet: { before: before.topSet, after: after.topSet },
          workingSetCount: { before: before.workingSetCount, after: after.workingSetCount },
        };
  const otherWorkouts = db.all<ExerciseProgressWorkout>(
    `
    SELECT t.id, t.name, t.weekday FROM template t
    WHERE (? IS NULL OR t.id <> ?) AND EXISTS (
      SELECT 1 FROM templateExercise te WHERE te.templateId = t.id AND te.exerciseId = ?
    ) ORDER BY t.position, t.id
  `,
    [templateId ?? null, templateId ?? null, exerciseId],
  );
  const trend = strengthTrend(observations, now);
  const acceptedIndex = trend.trend.findLastIndex((point) => !point.isHeld);
  return {
    sessions,
    trendNow: trend.latest,
    bestEstimateSource,
    latestEstimateSource: sources[acceptedIndex] ?? null,
    curve: history.exercise?.strengthCurve ?? null,
    bestEstimate,
    changes,
    otherWorkouts,
    machineBrands: ExerciseSeries.machineBrands(all),
  };
}
