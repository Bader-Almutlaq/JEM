import styles from './TargetRangeRow.module.css';

/** One target as a low–high pair on a single line ("Reps 6 – 10"); the high end may be left empty. */
export function TargetRangeRow({
  label,
  low,
  high,
  onLow,
  onHigh,
  placeholder,
  inputMode,
}: {
  readonly label: string;
  readonly low: string;
  readonly high: string;
  readonly onLow: (value: string) => void;
  readonly onHigh: (value: string) => void;
  /** Example values shown when empty, e.g. ["2:00", "3:00"]. */
  readonly placeholder: readonly [string, string];
  readonly inputMode: 'numeric' | 'decimal' | 'text';
}) {
  return (
    <div className={styles.row} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        aria-label={`${label} from`}
        inputMode={inputMode}
        placeholder={placeholder[0]}
        value={low}
        onChange={(event) => onLow(event.target.value)}
      />
      <span className={styles.dash} aria-hidden>
        –
      </span>
      <input
        className={styles.input}
        aria-label={`${label} to`}
        inputMode={inputMode}
        placeholder={placeholder[1]}
        value={high}
        onChange={(event) => onHigh(event.target.value)}
      />
    </div>
  );
}
