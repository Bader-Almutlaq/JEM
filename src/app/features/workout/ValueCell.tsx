import styles from './ValueCell.module.css';
import type { ValueSuggestion } from './ValueSuggestion';

/** One tappable number in a set row: weight, reps or RPE. Opens the number pad. */
export function ValueCell({
  name,
  text,
  isPlaceholder,
  isEditing,
  unitSuffix,
  onPress,
  suggestion,
  readOnly = false,
  size,
}: {
  readonly readOnly?: boolean;
  /** Which value this is, so the box is only as wide as what it holds. */
  readonly size?: 'weight' | 'reps' | 'rpe';
  /** What the cell holds, for screen readers: "Weight", "Reps"… */
  readonly name: string;
  readonly text: string;
  /** Nothing logged yet, so the number is drawn quieter. */
  readonly isPlaceholder: boolean;
  readonly isEditing: boolean;
  /** The unit, when the set was typed in a different unit than the exercise shows. */
  readonly unitSuffix?: string;
  readonly onPress: () => void;
  /** Optional opt-in value; never replaces the saved/greyed value until tapped. */
  readonly suggestion?: ValueSuggestion;
}) {
  // When the untouched value already is the suggestion (e.g. a new warm-up), show it once, in amber.
  const showsSuggestion =
    suggestion !== undefined && !suggestion.keepsPrevious && isPlaceholder && suggestion.text === text;
  const Element = readOnly ? 'span' : 'button';
  return (
    <div className={styles.values} data-read-only={readOnly}>
      <Element
        type={readOnly ? undefined : 'button'}
        className={styles.cell}
        data-size={size}
        data-editing={isEditing}
        data-placeholder={isPlaceholder}
        data-suggested={showsSuggestion}
        aria-label={name}
        onClick={readOnly ? undefined : onPress}
      >
        <span className={styles.value}>{text}</span>
        {unitSuffix !== undefined && !isEditing && <span className={styles.unit}>{unitSuffix}</span>}
      </Element>
      {suggestion !== undefined && !showsSuggestion && !isEditing && (
        <Element
          type={readOnly ? undefined : 'button'}
          className={styles.suggestion}
          data-progression={suggestion.isProgression === true}
          aria-label={`${readOnly ? 'Suggested' : 'Use suggested'} ${name.toLowerCase()} ${suggestion.text}`}
          onClick={readOnly ? undefined : () => suggestion.onAccept(suggestion.value)}
        >
          {suggestion.text}
        </Element>
      )}
    </div>
  );
}
