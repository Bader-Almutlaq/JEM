import type { WorkoutExerciseBest } from '../../../core/queries/WorkoutExerciseBests';
import { rpeNumberText } from '../../format/setText';
import { previousText } from '../workout/setCellText';
import styles from './ExerciseBestsTable.module.css';

/**
 * A workout's exercises, each with its number of sets and its best set ("3 × Squat (Barbell)  90 kg × 5 @ 6").
 * Shows the first `limit` and says how many more there are; omit `limit` to show all.
 */
export function ExerciseBestsTable({
  label,
  exercises,
  limit,
}: {
  /** Names the table for screen readers. */
  readonly label: string;
  readonly exercises: readonly WorkoutExerciseBest[];
  readonly limit?: number;
}) {
  if (exercises.length === 0) return null;
  const shown = limit === undefined ? exercises : exercises.slice(0, limit);
  return (
    <div className={styles.table} role="table" aria-label={label}>
      <div className={styles.headRow} role="row">
        <span role="columnheader">Exercise</span>
        <span role="columnheader">Best set</span>
      </div>
      {shown.map((exercise, index) => (
        <div key={index} className={styles.row} role="row">
          <span className={styles.exercise} role="cell">
            <span className={styles.count}>{exercise.setCount}</span> × {exercise.name}
          </span>
          <span className={styles.best} role="cell">
            {previousText(exercise.best, exercise.tracking, exercise.best.entryUnit)}
            {exercise.best.rpe === null ? '' : ` @ ${rpeNumberText(exercise.best.rpe)}`}
          </span>
        </div>
      ))}
      {exercises.length > shown.length && <span className={styles.more}>+{exercises.length - shown.length} more</span>}
    </div>
  );
}
