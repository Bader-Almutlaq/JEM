import type { Database } from '../db/Database';
import type { WorkoutSet } from '../models/WorkoutSet';
import { completedEntrySets } from './PreviousPerformance';

/** Heuristic: the owner's T-090 last-three-session window; deloads and empty occurrences do not count. */
const ProgressionHistoryWindow = Object.freeze({ sessions: 3 });

/** Latest three finished, non-deload occurrences within this saved workout, newest first.
 * Completed working/drop/failure sets qualify a session; warm-ups are retained for positional matching.
 * Repeated exercises match by occurrence. A recorded manufacturer must match exactly ignoring case;
 * no other-workout or other-machine fallback supplies evidence for automatic progression.
 */
export function progressionHistory(
  db: Database,
  exerciseId: number,
  templateId: number | null,
  occurrence: number,
  excludingWorkout: number | null = null,
  machineBrand: string | null = null,
): readonly (readonly WorkoutSet[])[] {
  if (templateId === null) return [];
  return db
    .all<{ id: number }>(
      `
    SELECT we.id FROM workoutExercise we JOIN workout w ON w.id = we.workoutId
    WHERE we.exerciseId = ? AND w.templateId = ? AND w.isInProgress = 0
      AND w.id IS NOT ? AND we.deloadStage IS NULL
      AND (? IS NULL OR we.machineBrand = ? COLLATE NOCASE)
      AND (SELECT COUNT(*) FROM workoutExercise earlier
        WHERE earlier.workoutId = we.workoutId AND earlier.exerciseId = we.exerciseId
          AND (earlier.position < we.position OR (earlier.position = we.position AND earlier.id < we.id))) = ?
      AND EXISTS (SELECT 1 FROM workoutSet s WHERE s.workoutExerciseId = we.id
        AND s.isCompleted = 1 AND s.kind <> 'warmup')
    ORDER BY w.startedAt DESC, w.id DESC LIMIT ?
  `,
      [
        exerciseId,
        templateId,
        excludingWorkout,
        machineBrand,
        machineBrand,
        occurrence,
        ProgressionHistoryWindow.sessions,
      ],
    )
    .map((entry) => completedEntrySets(db, entry.id));
}
