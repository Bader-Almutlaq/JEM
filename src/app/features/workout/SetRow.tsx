import kindStyles from './SetKindMenu.module.css';
import { displayValue } from '../../../core/units/Weight';
import { progressionValueSuggestion } from './progressionValueSuggestion';
import type { ValueSuggestion } from './ValueSuggestion';
import type { Field } from './Cell';
import { cellText } from './setCellText';
import { recordsDuration } from './trackingKinds';
import type { WeightUnit } from '../../../core/units/WeightUnit';
import { WorkoutTextField } from './WorkoutTextField';
import { useEffect, useRef, useState } from 'react';
import type { WorkoutSet } from '../../../core/models/WorkoutSet';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { SwipeToDelete } from '../../design/components/SwipeToDelete';
import type { EditedCell } from './CellEditor';
import { CheckButton } from './CheckButton';
import type { ExerciseCardActions } from './ExerciseCardActions';
import { SetCell } from './SetCell';
import { previousText } from './setCellText';
import grid from './SetGrid.module.css';
import { SetKindMenu } from './SetKindMenu';
import styles from './SetRow.module.css';
import { isBodyweightLoad, recordsWeight } from './trackingKinds';

/**
 * One set: its label, last session's numbers, the editable cells and the check. It draws what it is
 * given and reports taps; the screen decides what they do.
 */
export function SetRow({
  entry,
  set,
  label,
  previous,
  editing,
  actions,
  isSuggested = false,
  onNotesChange,
  isPastWorkout = false,
  displayUnit,
  readOnly = false,
}: {
  readonly entry: LiveWorkoutEntry;
  readonly set: WorkoutSet;
  /** "1", "2"…, or "W", "D", "F". */
  readonly label: string;
  /** The set done at the same position last session, if any. */
  readonly previous: WorkoutSet | undefined;
  /** The cell of this row the pad is typing into, if any. */
  readonly editing: EditedCell | undefined;
  readonly actions?: ExerciseCardActions;
  readonly readOnly?: boolean;
  readonly isSuggested?: boolean;
  /** History retains completed state and exposes per-set notes without a logging toggle. */
  readonly isPastWorkout?: boolean;
  /** The card header unit, so mixed imported units are always identified correctly. */
  readonly displayUnit?: WeightUnit;
  readonly onNotesChange?: (notes: string) => void;
}) {
  const [addingNote, setAddingNote] = useState(false);
  const { tracking } = entry.exercise;
  const defaultEntryUnit = displayUnit ?? entry.exercise.defaultEntryUnit;
  const row = useRef<HTMLDivElement>(null);
  const isEditingRow = editing !== undefined;
  // The badge follows the pad while RPE is typed, so it never disagrees with the cell being edited.
  const shownRpe = editing?.cell.field === 'rpe' ? (editing.text === '' ? null : Number(editing.text)) : set.rpe;

  // Brings the row into view above the pad when the pad opens on it.
  useEffect(() => {
    if (isEditingRow) row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [isEditingRow]);

  // A set typed in the other unit shows its own unit beside the number, so it is never misread.
  const isInOtherUnit =
    set.entryUnit !== defaultEntryUnit && !(isBodyweightLoad(tracking) && set.weightKilograms === 0);
  const edit = (field: 'weight' | 'reps' | 'rpe') => () => actions?.edit(set.id, field);
  const isPrefilled = (field: Field) =>
    !isPastWorkout && !set.isCompleted && actions?.isValueEntered?.(set.id, field) !== true;
  const suggestion = (field: 'weight' | 'reps'): ValueSuggestion | undefined => {
    const apply = actions?.applySuggestion;
    // Looking at a saved workout before starting it shows what is planned, never progression advice.
    if (readOnly || !isPrefilled(field) || apply === undefined || isPastWorkout) return undefined;
    if (entry.deload !== undefined && field === 'reps' && recordsDuration(tracking)) return undefined;
    const progression = (entry.deload ?? entry.progression)?.suggestions.find((item) => item.setId === set.id);
    // A deload can be enabled after template prefill chose a different session. Showing it never changes that saved value.
    const reference = entry.deload === undefined ? previous : set;
    if (progression !== undefined && reference !== undefined) {
      const result = progressionValueSuggestion(progression, set, reference, field, (value) =>
        apply?.(set.id, field, value),
      );
      return result === undefined ? undefined : { ...result, isProgression: entry.deload === undefined };
    }
    if (!isSuggested) return undefined;
    return {
      value:
        field === 'weight'
          ? displayValue(set.weightKilograms, set.entryUnit)
          : recordsDuration(tracking)
            ? (set.durationSeconds ?? 0)
            : set.reps,
      text: cellText(set, field, tracking),
      onAccept: (value) => apply?.(set.id, field, value),
    };
  };

  const content = (
    <>
      <div
        ref={row}
        className={`${grid.grid} ${styles.row}`}
        data-weight={recordsWeight(tracking)}
        data-past={isPastWorkout}
        data-read-only={readOnly}
        data-completed={set.isCompleted}
        data-kind={set.kind}
      >
        {readOnly ? (
          <span className={kindStyles.label} data-kind={set.kind}>
            {label}
          </span>
        ) : (
          <SetKindMenu
            label={label}
            kind={set.kind}
            onSelectKind={(kind) => actions?.selectKind(set.id, kind)}
            onDelete={() => actions?.deleteSet(set.id)}
            {...(onNotesChange !== undefined && !set.notes ? { onAddNote: () => setAddingNote(true) } : {})}
          />
        )}
        <span className={styles.previous}>
          {previous === undefined
            ? '—'
            : `${previousText(previous, tracking, set.entryUnit)}${readOnly && previous.rpe !== null ? ` @ ${previous.rpe}` : ''}`}
        </span>
        {recordsWeight(tracking) && (
          <SetCell
            readOnly={readOnly}
            isCompact={!isPastWorkout}
            set={set}
            field="weight"
            isSuggested={isPrefilled('weight')}
            suggestion={suggestion('weight')}
            tracking={tracking}
            editing={editing}
            {...(isInOtherUnit ? { unitSuffix: set.entryUnit } : {})}
            onPress={edit('weight')}
          />
        )}
        <SetCell
          readOnly={readOnly}
          isCompact={!isPastWorkout}
          isSuggested={isPrefilled('reps')}
          suggestion={suggestion('reps')}
          set={set}
          field="reps"
          tracking={tracking}
          editing={editing}
          onPress={edit('reps')}
        />
        {isPastWorkout && (
          <SetCell
            isCompact={false}
            set={set}
            field="rpe"
            tracking={tracking}
            editing={editing}
            onPress={edit('rpe')}
          />
        )}
        {!readOnly && (
          <CheckButton
            isCompleted={set.isCompleted}
            isDisabled={isPastWorkout}
            {...(isPastWorkout ? {} : { rpe: shownRpe, onEditRpe: edit('rpe') })}
            onPress={() => actions?.toggleCompleted(entry, set)}
          />
        )}
      </div>
      {onNotesChange !== undefined && (Boolean(set.notes) || addingNote) && (
        <WorkoutTextField
          isMultiline
          initiallyOpen={addingNote}
          label={`Set ${label} notes`}
          value={set.notes ?? ''}
          onSave={(value) => {
            onNotesChange(value);
            setAddingNote(false);
          }}
        />
      )}
    </>
  );
  return readOnly ? (
    content
  ) : (
    <SwipeToDelete isTransparent label="Delete set" onDelete={() => actions?.deleteSet(set.id)}>
      {content}
    </SwipeToDelete>
  );
}
