import { workoutExercisePath } from './templatePaths';
import { matchPreviousSets } from '../../../core/queries/PreviousPerformance';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { setLabels } from '../../format/setText';
import { ExerciseCardHeader } from '../workout/ExerciseCardHeader';
import { ExerciseInfoLine } from '../workout/ExerciseInfoLine';
import { SetColumnHeader } from '../workout/SetColumnHeader';
import { SetRow } from '../workout/SetRow';
import styles from '../workout/ExerciseCard.module.css';

/** Thin read-only composition of the live workout layout, with no queries or logging actions. */
export function WorkoutPreviewCard({
  entry,
  suggestedWarmupSetIds,
  templateId,
}: {
  readonly entry: LiveWorkoutEntry;
  readonly templateId?: number;
  readonly suggestedWarmupSetIds: readonly number[];
}) {
  const labels = setLabels(entry.sets);
  const previous = matchPreviousSets(entry.sets, entry.previous);
  return (
    <section className={styles.card} aria-label={entry.exercise.name}>
      <ExerciseCardHeader
        readOnly
        entry={entry}
        index={0}
        count={1}
        {...(templateId === undefined ? {} : { nameTo: workoutExercisePath(templateId, entry.exercise.id) })}
      />
      <ExerciseInfoLine readOnly entry={entry} />
      <SetColumnHeader readOnly tracking={entry.exercise.tracking} unit={entry.exercise.defaultEntryUnit} />
      {entry.sets.map((set, position) => (
        <SetRow
          readOnly
          key={set.id}
          entry={entry}
          set={set}
          label={labels[position] ?? ''}
          previous={previous[position]}
          editing={undefined}
          isSuggested={suggestedWarmupSetIds.includes(set.id)}
        />
      ))}
    </section>
  );
}
