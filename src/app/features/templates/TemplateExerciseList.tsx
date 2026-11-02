import type { Equipment } from '../../../core/library/Equipment';
import type { ExerciseTracking } from '../../../core/library/ExerciseTracking';
import { isTimedExercise } from './isTimedExercise';
import { EmptyState } from '../../design/components/EmptyState';
import { exerciseNameOf } from './exerciseNames';
import { isSupersetWithNext } from './templateExerciseEdits';
import type { TemplateEditorModel } from './TemplateEditorModel';
import { TemplateExerciseCard } from './TemplateExerciseCard';
import styles from './TemplateExerciseList.module.css';

/** The exercise cards of the template being edited, or a line saying how to add the first one. */
export function TemplateExerciseList({
  model,
  names,
  equipment,
  tracking,
}: {
  readonly model: TemplateEditorModel;
  readonly names: ReadonlyMap<number, string>;
  readonly equipment: ReadonlyMap<number, Equipment | null>;
  readonly tracking: ReadonlyMap<number, ExerciseTracking>;
}) {
  const { draft, pad, actions } = model;
  if (draft.exercises.length === 0) return <EmptyState message="No exercises yet. Add the first one below." />;
  return (
    <div className={styles.cards}>
      {draft.exercises.map((exercise, index) => (
        <TemplateExerciseCard
          // The same exercise can be in a template twice, so its position is the only identity it has.
          key={index}
          exercise={exercise}
          templateId={draft.id ?? null}
          occurrence={draft.exercises.slice(0, index).filter((item) => item.exerciseId === exercise.exerciseId).length}
          equipment={equipment.get(exercise.exerciseId) ?? null}
          isTimed={isTimedExercise(tracking.get(exercise.exerciseId))}
          name={exerciseNameOf(names, exercise.exerciseId)}
          index={index}
          count={draft.exercises.length}
          isSupersetWithNext={isSupersetWithNext(draft, index)}
          editing={pad.editing?.cell.exerciseIndex === index ? pad.editing : undefined}
          actions={actions}
        />
      ))}
    </div>
  );
}
