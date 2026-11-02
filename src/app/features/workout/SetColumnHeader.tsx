import { Check } from 'lucide-react';
import type { ExerciseTracking } from '../../../core/library/ExerciseTracking';
import type { WeightUnit } from '../../../core/units/WeightUnit';
import grid from './SetGrid.module.css';
import styles from './SetColumnHeader.module.css';
import { isBodyweightLoad, recordsDuration, recordsWeight } from './trackingKinds';

/** The titles above an exercise's sets: SET, PREVIOUS, the weight unit, REPS (or TIME) and a check; history retains RPE. */
export function SetColumnHeader({
  tracking,
  unit,
  isPastWorkout = false,
  readOnly = false,
}: {
  readonly readOnly?: boolean;
  readonly tracking: ExerciseTracking;
  readonly unit: WeightUnit;
  /** Preserve the historical editor's separate effort column. */
  readonly isPastWorkout?: boolean;
}) {
  return (
    <div
      className={`${grid.grid} ${styles.header}`}
      data-weight={recordsWeight(tracking)}
      data-past={isPastWorkout}
      data-read-only={readOnly}
    >
      <span>Set</span>
      <span>Previous</span>
      {recordsWeight(tracking) && (
        <span className={styles.centered}>{`${isBodyweightLoad(tracking) ? 'Added ' : ''}${unit}`}</span>
      )}
      <span className={styles.centered}>{recordsDuration(tracking) ? 'Time' : 'Reps'}</span>
      {isPastWorkout && <span className={styles.centered}>RPE</span>}
      {!readOnly && <Check size={14} strokeWidth={2} className={styles.check} aria-hidden />}
    </div>
  );
}
