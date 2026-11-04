import type { ReactNode } from 'react';
import styles from './Section.module.css';

/** A labelled group: uppercase caption, then a hairline card, then an optional footnote. */
export function Section({
  label,
  footnote,
  children,
}: {
  readonly label: string;
  readonly footnote?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.label}>{label}</h2>
      <div className={styles.card}>{children}</div>
      {footnote !== undefined && <p className={styles.footnote}>{footnote}</p>}
    </section>
  );
}

/** One label–value line inside a `Section`, with an optional quieter second line under the label or the value. */
export function SectionRow({
  label,
  value,
  detail,
  valueDetail,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: string;
  readonly valueDetail?: string;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowSide}>
        <span className={styles.rowLabel}>{label}</span>
        {detail !== undefined && <span className={styles.rowDetail}>{detail}</span>}
      </span>
      <span className={`${styles.rowSide} ${styles.rowEnd}`}>
        <span className={styles.rowValue}>{value}</span>
        {valueDetail !== undefined && <span className={styles.rowDetail}>{valueDetail}</span>}
      </span>
    </div>
  );
}
