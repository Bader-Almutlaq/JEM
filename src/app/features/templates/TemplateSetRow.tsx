import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { TemplateSetDraft } from '../../../core/templates/TemplateDraft';
import { SetKindButton } from './SetKindButton';
import type { TargetCell, TargetField } from './TargetCell';
import { TargetValueCell } from './TargetValueCell';
import type { TemplateEditorActions } from './TemplateEditorActions';
import grid from './TemplateSetGrid.module.css';
import styles from './TemplateSetRow.module.css';

/**
 * One planned set: its kind, the two ends of the rep range, the RPE and a remove button. It draws
 * what it is given and reports taps; the editor decides what they do.
 */
export function TemplateSetRow({
  exerciseIndex,
  setIndex,
  set,
  label,
  previous,
  isTimed,
  canRemove,
  editing,
  actions,
}: {
  readonly exerciseIndex: number;
  readonly setIndex: number;
  readonly set: TemplateSetDraft;
  /** "W", "1", "2"…, "D" or "F". */
  readonly label: string;
  readonly previous: string;
  readonly isTimed: boolean;
  /** An exercise keeps at least one set. */
  readonly canRemove: boolean;
  /** The target of this set the pad is typing into, with the text typed so far. */
  readonly editing: { readonly field: TargetField; readonly text: string } | undefined;
  readonly actions: TemplateEditorActions;
}) {
  const row = useRef<HTMLDivElement>(null);
  const isEditingRow = editing !== undefined;

  // Brings the row into view above the pad when the pad opens on it.
  useEffect(() => {
    if (isEditingRow) row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [isEditingRow]);

  const cellFor = (field: TargetField, value: number | null) => {
    const cell: TargetCell = { exerciseIndex, setIndex, field };
    return (
      <TargetValueCell
        field={field}
        isTimed={isTimed}
        value={value}
        typedText={editing?.field === field ? editing.text : undefined}
        onPress={() => actions.edit(cell)}
      />
    );
  };

  return (
    <div ref={row} className={`${grid.grid} ${styles.row}`} data-kind={set.kind}>
      <SetKindButton
        kind={set.kind}
        label={label}
        setNumber={setIndex + 1}
        onPress={() => actions.cycleKind(exerciseIndex, setIndex)}
      />
      <span className={styles.previous}>{previous}</span>
      {cellFor('repsLow', set.targetRepsLow)}
      {cellFor('repsHigh', set.targetRepsHigh)}
      {cellFor('rpe', set.targetRpe)}
      <button
        type="button"
        className={styles.remove}
        aria-label="Remove set"
        disabled={!canRemove}
        onClick={() => actions.removeSet(exerciseIndex, setIndex)}
      >
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
