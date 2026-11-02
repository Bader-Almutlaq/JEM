import { RepRangeDialog } from './RepRangeDialog';
import { useState } from 'react';
import { database, useDatabaseQuery } from '../../data/database';
import { clockText } from '../../format/clockText';
import { ExerciseNoteDialog } from '../workout/ExerciseNoteDialog';
import type { Equipment } from '../../../core/library/Equipment';
import { usesMachineBrand } from '../../../core/library/MachineBrands';
import { MachineBrandSheet } from '../workout/MachineBrandSheet';
import { ProgressionRangeDialog } from './ProgressionRangeDialog';
import { Plus } from 'lucide-react';
import type { TemplateExerciseDraft } from '../../../core/templates/TemplateDraft';
import type { TargetCell } from './TargetCell';
import type { TemplateEditorActions } from './TemplateEditorActions';
import styles from './TemplateExerciseCard.module.css';
import { TemplateExerciseHeader } from './TemplateExerciseHeader';
import { TemplateSetColumnHeader } from './TemplateSetColumnHeader';
import { TemplateSetRow } from './TemplateSetRow';

/** One exercise of the template being edited: its name and menu, column titles, set rows and "Add set". */
export function TemplateExerciseCard({
  exercise,
  equipment,
  isTimed,
  name,
  index,
  count,
  isSupersetWithNext,
  editing,
  actions,
}: {
  readonly exercise: TemplateExerciseDraft;
  readonly equipment?: Equipment | null;
  readonly isTimed: boolean;
  readonly name: string;
  readonly index: number;
  readonly count: number;
  readonly isSupersetWithNext: boolean;
  /** The target the pad is typing into, if it is in this exercise. */
  readonly editing: { readonly cell: TargetCell; readonly text: string } | undefined;
  readonly actions: TemplateEditorActions;
}) {
  const [showMachine, setShowMachine] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [showProgression, setShowProgression] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const detail = useDatabaseQuery(`template-exercise-info-${exercise.exerciseId}`, () =>
    database.exerciseDetail(exercise.exerciseId),
  );
  const rest = detail.status === 'ready' ? detail.value?.exercise.restTargetSeconds : null;
  const target = exercise.sets.find((set) => set.kind !== 'warmup');
  const range =
    target?.targetRepsLow === null || target?.targetRepsLow === undefined
      ? ''
      : `${target.targetRepsLow}${target.targetRepsHigh === null || target.targetRepsHigh === target.targetRepsLow ? '' : `–${target.targetRepsHigh}`} reps`;
  const isInSuperset = exercise.supersetGroup !== null;
  return (
    <section className={styles.card} data-superset={isInSuperset} aria-label={name}>
      <TemplateExerciseHeader
        name={name}
        hasNote={Boolean(exercise.notes)}
        onNote={() => setShowNote(true)}
        onRepRange={() => setShowRange(true)}
        index={index}
        count={count}
        isInSuperset={isInSuperset}
        isSupersetWithNext={isSupersetWithNext}
        actions={actions}
        {...(!isTimed ? { onProgression: () => setShowProgression(true) } : {})}
      />
      {detail.status === 'failed' && <p role="alert">{detail.message}</p>}
      {(range || (rest !== null && rest !== undefined) || exercise.progression === 'double') && (
        <div className={styles.info}>
          <span>
            {[range, rest === null || rest === undefined ? '' : `Rest ${clockText(rest)}`].filter(Boolean).join(' · ')}
          </span>
          {exercise.progression === 'double' && <span className={styles.progressionLabel}>Progression on</span>}
        </div>
      )}
      {showProgression && (
        <ProgressionRangeDialog
          onCancel={() => setShowProgression(false)}
          onSave={(low, high) => {
            actions.setProgression(index, 'double', { low, high });
            setShowProgression(false);
          }}
          {...(exercise.progression === 'double'
            ? {
                onTurnOff: () => {
                  actions.setProgression(index, null);
                  setShowProgression(false);
                },
              }
            : {})}
        />
      )}
      {showRange && (
        <RepRangeDialog
          target={target}
          onCancel={() => setShowRange(false)}
          onSave={(value) => {
            actions.setRepRange(index, value);
            setShowRange(false);
          }}
        />
      )}
      {exercise.notes && (
        <button type="button" className={styles.note} onClick={() => setShowNote(true)}>
          {exercise.notes}
        </button>
      )}
      {showNote && (
        <ExerciseNoteDialog
          note={exercise.notes ?? ''}
          onCancel={() => setShowNote(false)}
          onSave={(note) => {
            actions.setExerciseNotes(index, note);
            setShowNote(false);
          }}
        />
      )}
      {usesMachineBrand(equipment ?? null) && (
        <div className={styles.progression}>
          <button type="button" onClick={() => setShowMachine(true)}>
            Machine: {exercise.machineBrand ?? 'None'}
          </button>
        </div>
      )}
      {showMachine && (
        <MachineBrandSheet
          value={exercise.machineBrand ?? null}
          onClose={() => setShowMachine(false)}
          onSave={(brand) => {
            actions.setMachineBrand(index, brand);
            setShowMachine(false);
          }}
        />
      )}
      <TemplateSetColumnHeader isTimed={isTimed} />
      {exercise.sets.map((set, setIndex) => (
        <TemplateSetRow
          // A set has no id of its own; its position is its identity, and the editor changes positions only by re-rendering the whole card.
          key={setIndex}
          exerciseIndex={index}
          setIndex={setIndex}
          set={set}
          isTimed={isTimed}
          canRemove={exercise.sets.length > 1}
          editing={editing?.cell.setIndex === setIndex ? { field: editing.cell.field, text: editing.text } : undefined}
          actions={actions}
        />
      ))}
      <div className={styles.addButtons}>
        <button type="button" className={styles.addSet} onClick={() => actions.addSet(index)}>
          <Plus size={16} strokeWidth={2} aria-hidden />
          <span>Add set</span>
        </button>
        <button type="button" className={styles.addSet} onClick={() => actions.addSet(index, 'warmup')}>
          <Plus size={16} strokeWidth={2} aria-hidden />
          <span>Add warm-up set</span>
        </button>
      </div>
    </section>
  );
}
