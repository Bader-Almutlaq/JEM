import styles from './TablePill.module.css';

/**
 * The small "Table" pill that shows or hides a chart's data table. It reads "Table" on screen and names its
 * action ("Show table" / "Hide table") for screen readers; the hit area is 44 px although the pill is 28 px tall.
 * `controls` is the id of the table it reveals, when that table is in the page.
 */
export function TablePill({
  shown,
  onToggle,
  controls,
}: {
  readonly shown: boolean;
  readonly onToggle: () => void;
  readonly controls?: string;
}) {
  return (
    <button
      type="button"
      className={styles.pill}
      aria-label={shown ? 'Hide table' : 'Show table'}
      aria-expanded={shown}
      aria-controls={controls}
      onClick={onToggle}
    >
      Table
    </button>
  );
}
