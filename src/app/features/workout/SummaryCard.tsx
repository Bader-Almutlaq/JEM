import type { ReactNode } from 'react';
import styles from './SummaryCard.module.css';

/** A titled card of the finish summary. Its rows are `SummaryRow`s, or any content that lays itself out. */
export function SummaryCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  );
}

/** One row of a summary card: what it is on the left, its value on the right, with an optional quieter line under either. */
export function SummaryRow({
  label,
  detail,
  value,
  valueDetail,
}: {
  readonly label: string;
  readonly detail?: string;
  readonly value: string;
  readonly valueDetail?: string;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.side}>
        <span className={styles.primary}>{label}</span>
        {detail !== undefined && <span className={styles.secondary}>{detail}</span>}
      </div>
      <div className={`${styles.side} ${styles.end}`}>
        <span className={styles.primary}>{value}</span>
        {valueDetail !== undefined && <span className={styles.secondary}>{valueDetail}</span>}
      </div>
    </div>
  );
}
