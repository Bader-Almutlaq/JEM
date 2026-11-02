import type { ExerciseTracking } from '../../../core/library/ExerciseTracking';
import type { WorkoutSet } from '../../../core/models/WorkoutSet';
import type { Field } from './Cell';
import type { EditedCell } from './CellEditor';
import { cellText, isCellEmpty } from './setCellText';
import { recordsDuration } from './trackingKinds';
import { ValueCell } from './ValueCell';
import type { ValueSuggestion } from './ValueSuggestion';

/** The name of a cell for screen readers. */
function cellName(field: Field, tracking: ExerciseTracking): string {
  if (field === 'weight') return 'Weight';
  if (field === 'rpe') return 'RPE';
  return recordsDuration(tracking) ? 'Time' : 'Reps';
}

/**
 * One value of a set row. While the pad is typing into it, it shows the typed text ("0", or "—"
 * for RPE, when nothing is typed); otherwise the saved value.
 */
export function SetCell({
  set,
  field,
  tracking,
  editing,
  unitSuffix,
  onPress,
  isSuggested = false,
  suggestion,
  readOnly = false,
}: {
  readonly set: WorkoutSet;
  readonly readOnly?: boolean;
  readonly field: Field;
  readonly tracking: ExerciseTracking;
  /** The cell the pad is on, if it is this row's. */
  readonly editing: EditedCell | undefined;
  readonly unitSuffix?: string;
  readonly onPress: () => void;
  readonly isSuggested?: boolean;
  /** Opt-in value beside the current value, using the cell's display unit. */
  readonly suggestion?: ValueSuggestion | undefined;
}) {
  const isEditing = editing?.cell.field === field;
  const emptyText = field === 'rpe' ? '—' : '0';
  const text = isEditing ? editing.text : '';
  return (
    <ValueCell
      readOnly={readOnly}
      name={cellName(field, tracking)}
      text={isEditing ? text || emptyText : cellText(set, field, tracking)}
      isPlaceholder={isEditing ? text === '' : isSuggested || isCellEmpty(set, field, tracking)}
      size={field}
      isEditing={isEditing}
      {...(unitSuffix === undefined ? {} : { unitSuffix })}
      onPress={onPress}
      {...(suggestion === undefined ? {} : { suggestion })}
    />
  );
}
