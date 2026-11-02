import styles from './SummaryStat.module.css';

/** One figure of the finish summary: a small label over a number, with an optional quieter line under it. */
export function SummaryStat({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      {detail !== undefined && <span className={styles.detail}>{detail}</span>}
    </div>
  );
}
