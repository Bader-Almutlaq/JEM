import type { Database } from '../db/Database';
import type { Muscle } from '../library/Muscle';
import type { MuscleRole } from '../library/MuscleRole';
import type { ExerciseRow } from '../models/Exercise';
import type { SetKind } from '../models/SetKind';

/** Minimal completed-set history shared by period analytics; loads remain unrounded kilograms. */
export interface AnalyticsSet {
  readonly workoutId: number;
  readonly startedAt: string;
  readonly exerciseId: number;
  readonly kind: SetKind;
  readonly rpe: number | null;
  readonly reps: number;
  readonly weightKilograms: number;
}

/** One exercise's muscle association, without multiplying completed-set SQL rows. */
export interface AnalyticsMuscle {
  readonly muscle: Muscle;
  readonly role: MuscleRole;
}

/** Connection-owned reads; Database.cache invalidates sets and metadata together on every write. */
export const AnalyticsHistory = Object.freeze({
  /** Completed sets in [from, to), including warm-ups and deloads; optional current plan membership. */
  sets(db: Database, from: Date, to: Date, folderId?: number): readonly AnalyticsSet[] {
    return db.cache.get('AnalyticsHistory.sets', [from.toISOString(), to.toISOString(), folderId], () =>
      db.all<AnalyticsSet>(
        `
          SELECT w.id AS workoutId, w.startedAt, we.exerciseId,
                 s.kind, s.rpe, s.reps, s.weightKilograms
          FROM workout w
          JOIN workoutExercise we ON we.workoutId = w.id
          JOIN workoutSet s ON s.workoutExerciseId = we.id
          WHERE w.isInProgress = 0 AND s.isCompleted = 1
            AND w.startedAt >= ? AND w.startedAt < ?
            AND (? IS NULL OR w.templateId IN (SELECT id FROM template WHERE folderId = ?))
          ORDER BY w.startedAt, w.id, we.position, s.position
        `,
        [from.toISOString(), to.toISOString(), folderId ?? null, folderId ?? null],
      ),
    );
  },

  /** Small exercise-to-muscle map, retaining database association order and missing tags. */
  muscles(db: Database): ReadonlyMap<number, readonly AnalyticsMuscle[]> {
    return db.cache.get('AnalyticsHistory.muscles', [], () => {
      const result = new Map<number, AnalyticsMuscle[]>();
      const rows = db.all<AnalyticsMuscle & { exerciseId: number }>(`
        SELECT exerciseId, muscleId AS muscle, role FROM exerciseMuscle
      `);
      for (const row of rows) {
        const muscles = result.get(row.exerciseId) ?? [];
        muscles.push(row);
        result.set(row.exerciseId, muscles);
      }
      return result;
    });
  },

  /** Exercise metadata shared by coverage names and intensity estimates, including custom exercises. */
  exercises(db: Database): ReadonlyMap<number, ExerciseRow> {
    return db.cache.get(
      'AnalyticsHistory.exercises',
      [],
      () => new Map(db.all<ExerciseRow>('SELECT * FROM exercise').map((exercise) => [exercise.id, exercise])),
    );
  },
});
