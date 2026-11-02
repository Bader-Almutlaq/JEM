import { ExerciseCurve } from './ExerciseCurve';
import { historyBoundaryKey } from './HistoryBoundary';
import { ExerciseSessions } from './ExerciseSessions';
import type { PersonalCurve } from '../analytics/PersonalCurve';
import { estimatedOneRepMax } from '../analytics/EstimatedOneRepMax';
import type { DatedValue } from '../analytics/TimeBuckets';
import type { Database } from '../db/Database';
import { fromExerciseRow, type Exercise, type ExerciseRow } from '../models/Exercise';
import { isWorkSetKind } from '../models/SetKind';
import type { WorkoutSet } from '../models/WorkoutSet';

/** Heuristic: bound History rendering and worker responses to 200 sessions per page. */
export const ExerciseHistoryPolicy = Object.freeze({ pageSize: 200 });

/** One finished session, including completed warm-ups, across repeated exercise entries. */
export interface ExerciseSession {
  readonly workoutId: number;
  readonly date: string;
  readonly name: string;
  readonly sets: readonly WorkoutSet[];
  /** Marked exercise entries within this session; repeated normal entries stay distinct in History. */
  readonly deloadEntryIds: readonly number[];
  /** Manufacturer for each occurrence, including entries without completed sets. */
  readonly machineEntries: readonly { readonly id: number; readonly machineBrand: string | null }[];
}

/** Per-session value in kg, kg × reps, reps or seconds; never rounded or converted. */
export interface ExerciseSeriesPoint extends DatedValue {
  readonly workoutId: number;
  readonly set: WorkoutSet;
}

/** Shared read-only source for exercise charts and records; missing exercises have null metadata. */
export interface ExerciseSeriesHistory {
  readonly exercise: (Exercise & { readonly strengthCurve: PersonalCurve }) | null;
  readonly sessions: readonly ExerciseSession[];
}

function workSets(session: ExerciseSession): readonly WorkoutSet[] {
  return session.sets.filter((set) => isWorkSetKind(set.kind));
}

function maximums(history: ExerciseSeriesHistory, valueOf: (set: WorkoutSet) => number | null): ExerciseSeriesPoint[] {
  const points: ExerciseSeriesPoint[] = [];
  for (const session of history.sessions) {
    let best: ExerciseSeriesPoint | undefined;
    for (const set of workSets(session)) {
      const value = valueOf(set);
      if (value !== null && Number.isFinite(value) && (best === undefined || value > best.value)) {
        best = { workoutId: session.workoutId, date: session.date, value, set };
      }
    }
    if (best !== undefined) points.push(best);
  }
  return points;
}

/** Queries and descriptive series for finished sessions. Ties retain the first logged set; sessions stay distinct even on the same day. */
export const ExerciseSeries = Object.freeze({
  /** Completed sets, newest sessions first; a bounded page, including warm-ups for History. */
  history(
    db: Database,
    exerciseId: number,
    offset = 0,
    now = new Date(),
    templateId?: number,
  ): readonly ExerciseSession[] {
    const start = Math.max(0, Math.floor(offset));
    return ExerciseSessions.page(db, exerciseId, now, ExerciseHistoryPolicy.pageSize, start, templateId);
  },

  /**
   * All finished history through now, oldest first. Most analytics read every lift's history, so the
   * result is kept in the connection's cache until the next write and shared by every caller.
   */
  read(db: Database, exerciseId: number, now = new Date(), templateId?: number): ExerciseSeriesHistory {
    const key = [exerciseId, historyBoundaryKey(db, now), templateId];
    return db.cache.get('ExerciseSeries.read', key, () => {
      const row = db.get<ExerciseRow>('SELECT * FROM exercise WHERE id = ?', [exerciseId]);
      return {
        exercise:
          row === undefined
            ? null
            : { ...fromExerciseRow(row), strengthCurve: ExerciseCurve(db, exerciseId, row, now) },
        sessions: row === undefined ? [] : ExerciseSessions.all(db, exerciseId, now, templateId),
      };
    });
  },

  /** Distinct recorded manufacturers and null for unrecorded entries, sorted with null last. */
  machineBrands(history: ExerciseSeriesHistory): readonly (string | null)[] {
    const brands = new Map<string, string>();
    let unrecorded = false;
    for (const session of history.sessions)
      for (const entry of session.machineEntries) {
        if (entry.machineBrand === null) unrecorded = true;
        else if (!brands.has(entry.machineBrand.toLowerCase()))
          brands.set(entry.machineBrand.toLowerCase(), entry.machineBrand);
      }
    const names: (string | null)[] = [...brands.values()].sort((a, b) => a.localeCompare(b));
    if (unrecorded) names.push(null);
    return names;
  },

  /** Restricts sets and deload annotations to matching occurrences; null selects unrecorded machines. */
  filterMachine(history: ExerciseSeriesHistory, brand: string | null): ExerciseSeriesHistory {
    return {
      ...history,
      sessions: history.sessions.flatMap((session) => {
        const entries = session.machineEntries.filter((entry) =>
          brand === null ? entry.machineBrand === null : entry.machineBrand?.toLowerCase() === brand.toLowerCase(),
        );
        if (entries.length === 0) return [];
        const ids = new Set(entries.map((entry) => entry.id));
        return [
          {
            ...session,
            machineEntries: entries,
            sets: session.sets.filter((set) => ids.has(set.workoutExerciseId)),
            deloadEntryIds: session.deloadEntryIds.filter((id) => ids.has(id)),
          },
        ];
      }),
    };
  },

  /** Maximum qualifying e1RM per session, kg. Research report, recommended algorithms 1, 2 and 4; delegates all eligibility and arithmetic. */
  estimatedOneRepMax(history: ExerciseSeriesHistory): readonly ExerciseSeriesPoint[] {
    const exercise = history.exercise;
    return exercise === null
      ? []
      : maximums(history, (set) => estimatedOneRepMax(set, exercise)?.e1rmKilograms ?? null);
  },

  /** Heuristic: largest positive external load per session, independent of reps/RPE; only weight-reps and weight-duration track loads. */
  heaviestWeight(history: ExerciseSeriesHistory): readonly ExerciseSeriesPoint[] {
    if (history.exercise?.tracking !== 'weight-reps' && history.exercise?.tracking !== 'weight-duration') return [];
    return maximums(history, (set) => (set.weightKilograms > 0 ? set.weightKilograms : null));
  },

  /** Heuristic: sum(load kg × positive integer reps) over completed work sets per session, including drop/failure; not a measure of hypertrophy. */
  sessionVolume(history: ExerciseSeriesHistory): readonly ExerciseSeriesPoint[] {
    if (history.exercise?.tracking !== 'weight-reps') return [];
    return history.sessions.flatMap((session) => {
      const valid = workSets(session).filter(
        (set) =>
          Number.isFinite(set.weightKilograms) && set.weightKilograms > 0 && Number.isInteger(set.reps) && set.reps > 0,
      );
      const set = valid[0];
      if (set === undefined) return [];
      return [
        {
          workoutId: session.workoutId,
          date: session.date,
          value: valid.reduce((sum, item) => sum + item.weightKilograms * item.reps, 0),
          set,
        },
      ];
    });
  },

  /** Heuristic: most positive integer reps in one completed work set, regardless of load; bodyweight load is never treated as total mass. */
  bestReps(history: ExerciseSeriesHistory): readonly ExerciseSeriesPoint[] {
    if (history.exercise?.tracking !== 'weight-reps' && history.exercise?.tracking !== 'bodyweight-reps') return [];
    return maximums(history, (set) => (Number.isInteger(set.reps) && set.reps > 0 ? set.reps : null));
  },

  /** Heuristic: longest completed work set in seconds; only timed tracking kinds apply. */
  duration(history: ExerciseSeriesHistory): readonly ExerciseSeriesPoint[] {
    if (history.exercise?.tracking !== 'duration' && history.exercise?.tracking !== 'weight-duration') return [];
    return maximums(history, (set) =>
      set.durationSeconds !== null && set.durationSeconds > 0 ? set.durationSeconds : null,
    );
  },

  /** Heuristic: cumulative maximum of qualifying session e1RM in kg, retained at every qualifying session to show plateaus. */
  progression(history: ExerciseSeriesHistory): readonly ExerciseSeriesPoint[] {
    let best = 0;
    return ExerciseSeries.estimatedOneRepMax(history).map((point) => {
      best = Math.max(best, point.value);
      return { ...point, value: best };
    });
  },
});
