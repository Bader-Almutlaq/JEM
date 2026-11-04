import type { SetKind } from '../../../core/models/SetKind';
import kindStyles from '../workout/SetKindMenu.module.css';
import { SET_KIND_NAMES } from '../workout/setKindItems';
import styles from './SetKindButton.module.css';

/** The kind of a template set. Tapping it steps to the next kind. */
export function SetKindButton({
  kind,
  label,
  setNumber,
  onPress,
}: {
  readonly kind: SetKind;
  /** "W", "1", "2"…, "D" or "F", as the live workout writes them (`setLabels`). */
  readonly label: string;
  /** The set's place in its exercise, from 1, for screen readers. */
  readonly setNumber: number;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={`Set ${setNumber}, ${SET_KIND_NAMES[kind]}. Change kind`}
      onClick={onPress}
    >
      <span className={kindStyles.label} data-kind={kind}>
        {label}
      </span>
    </button>
  );
}
