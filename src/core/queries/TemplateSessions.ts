import { ExerciseCurve } from './ExerciseCurve';
import { historyBoundaryKey } from './HistoryBoundary';
import { estimatedOneRepMax } from '../analytics/EstimatedOneRepMax';
import type { Database } from '../db/Database';
import type { ExerciseRow } from '../models/Exercise';
import { countWorkoutSets } from './WorkoutHistory';
import type { AnalyticsSet } from './AnalyticsHistory';
import { groupBy } from '../support/groupBy';

/** A saved workout or its current plan; code keeps the existing template/folder names. */
export type TemplateSessionScope = { readonly templateId: number } | { readonly folderId: number };

/** One finished session, newest first; volume is completed non-warm-up kg × reps. */
export interface TemplateSession {
  readonly id: number;
  readonly templateId: number;
  readonly name: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  /** Elapsed seconds; null for absent, invalid, reversed or over-limit timing. */
  readonly durationSeconds: number | null;
  readonly workingSetCount: number;
  readonly volumeKilograms: number;
  /** Best qualifying estimate for the report's named top exercise, in kg; absent estimates stay null. */
  readonly bestEstimatedOneRepMaxKilograms: number | null;
}

/** A saved workout's session count, latest date and mean known duration, including never-performed workouts. */
export interface TemplateSessionTotals {
  readonly templateId: number;
  readonly name: string;
  readonly sessionCount: number;
  readonly lastStartedAt: string | null;
  readonly averageDurationSeconds: number | null;
}

/** Scoped session history and table totals; top exercise is the first saved exercise for a workout scope only. */
export interface TemplateSessionReport {
  readonly sessions: readonly TemplateSession[];
  readonly workouts: readonly TemplateSessionTotals[];
  readonly topExercise: { readonly id: number; readonly name: string } | null;
}

/** Heuristic: sessions left running in Strong beyond six hours are not representative durations. */
export const SessionDurationLimits = Object.freeze({ maximumSeconds: 6 * 60 * 60 });

/** Timestamp arithmetic uses SI milliseconds. */
const timing = Object.freeze({ millisecondsPerSecond: 1_000 });

function duration(start: string, end: string | null): number | null {
  if (end === null) return null;
  const seconds = (Date.parse(end) - Date.parse(start)) / timing.millisecondsPerSecond;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= SessionDurationLimits.maximumSeconds ? seconds : null;
}

function totals(template: { id: number; name: string }, sessions: readonly TemplateSession[]): TemplateSessionTotals {
  const matching = sessions.filter((session) => session.templateId === template.id);
  const durations = matching.flatMap((session) => (session.durationSeconds === null ? [] : [session.durationSeconds]));
  return {
    templateId: template.id,
    name: template.name,
    sessionCount: matching.length,
    lastStartedAt: matching[0]?.startedAt ?? null,
    averageDurationSeconds:
      durations.length === 0 ? null : durations.reduce((sum, item) => sum + item / durations.length, 0),
  };
}

/**
 * Finished sessions selected through template ids (folder lookup uses template_folderId).
 * One scoped set read supplies all sessions; no date functions wrap filter columns.
 * Reuses History's set counting and the existing e1RM helper. Volume is History's Σ kg × reps,
 * warm-ups excluded (research report: Refalo 2023, volume load is descriptive work, not a hypertrophy prediction).
 * All completed working/drop/failure sets count, including low-effort sets: hard sets are a different measure.
 * Plan membership follows the current templates; deleting or moving one changes the scope, never History itself.
 */
export const TemplateSessions = Object.freeze({
  /**
   * Missing scopes return an empty report. Multiple sessions on one day remain independent.
   * The set-based report is kept in the connection cache until the next write.
   */
  read(db: Database, scope: TemplateSessionScope): TemplateSessionReport {
    const key = [
      'templateId' in scope ? 'template' : 'folder',
      'templateId' in scope ? scope.templateId : scope.folderId,
    ];
    return db.cache.get('TemplateSessions.read', [...key, historyBoundaryKey(db, new Date())], () =>
      readReport(db, scope),
    );
  },
});

function readReport(db: Database, scope: TemplateSessionScope): TemplateSessionReport {
  return db.transaction(() => {
    const condition = 'templateId' in scope ? 'id = ?' : 'folderId = ?';
    const scopeId = 'templateId' in scope ? scope.templateId : scope.folderId;
    const templates = db.all<{ id: number; name: string }>(
      `
        SELECT id, name FROM template WHERE ${condition} ORDER BY position, id
      `,
      [scopeId],
    );
    const topExercise =
      'templateId' in scope
        ? db.get<ExerciseRow>(
            `
        SELECT e.* FROM templateExercise te
        JOIN exercise e ON e.id = te.exerciseId
        WHERE te.templateId = ? ORDER BY te.position, te.id LIMIT 1
      `,
            [scope.templateId],
          )
        : undefined;
    const strengthExercise =
      topExercise === undefined
        ? undefined
        : { ...topExercise, strengthCurve: ExerciseCurve(db, topExercise.id, topExercise) };
    const rows = db.all<{ id: number; templateId: number; name: string; startedAt: string; endedAt: string | null }>(
      `
        SELECT id, templateId, name, startedAt, endedAt FROM workout
        WHERE isInProgress = 0 AND templateId IN (SELECT id FROM template WHERE ${condition})
        ORDER BY startedAt DESC, id DESC
      `,
      [scopeId],
    );
    const setsByWorkout = groupBy(
      db.all<Omit<AnalyticsSet, 'startedAt'>>(
        `
          SELECT we.workoutId, we.exerciseId, s.kind, s.rpe, s.reps, s.weightKilograms
          FROM workout w
          JOIN workoutExercise we ON we.workoutId = w.id
          JOIN workoutSet s ON s.workoutExerciseId = we.id
          WHERE w.isInProgress = 0 AND s.isCompleted = 1
            AND w.templateId IN (SELECT id FROM template WHERE ${condition})
          ORDER BY we.position, we.id, s.position, s.id
        `,
        [scopeId],
      ),
      (set) => set.workoutId,
    );
    const sessions: TemplateSession[] = rows.map((row) => {
      const sets = setsByWorkout.get(row.id) ?? [];
      const estimates =
        strengthExercise === undefined
          ? []
          : sets
              .filter((set) => set.exerciseId === strengthExercise.id)
              .flatMap((set) => {
                const estimate = estimatedOneRepMax(set, strengthExercise);
                return estimate === null ? [] : [estimate.e1rmKilograms];
              });
      return {
        id: row.id,
        templateId: row.templateId,
        name: row.name,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        durationSeconds: duration(row.startedAt, row.endedAt),
        workingSetCount: countWorkoutSets(sets).setCount,
        volumeKilograms: sets
          .filter((set) => set.kind !== 'warmup')
          .reduce((sum, set) => sum + set.weightKilograms * set.reps, 0),
        bestEstimatedOneRepMaxKilograms: estimates.length === 0 ? null : Math.max(...estimates),
      };
    });
    return {
      sessions,
      workouts: templates.map((template) => totals(template, sessions)),
      topExercise: topExercise === undefined ? null : { id: topExercise.id, name: topExercise.name },
    };
  });
}
