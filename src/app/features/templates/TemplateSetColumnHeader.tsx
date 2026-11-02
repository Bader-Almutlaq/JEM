import grid from './TemplateSetGrid.module.css';
import styles from './TemplateSetColumnHeader.module.css';

/** The titles above a template exercise's sets: kind, the two ends of the rep range, and RPE. */
export function TemplateSetColumnHeader({ isTimed }: { readonly isTimed: boolean }) {
  return (
    <div className={`${grid.grid} ${styles.header}`}>
      <span>Set</span>
      <span>Previous</span>
      <span className={styles.centered}>{isTimed ? 'From s' : 'From'}</span>
      <span className={styles.centered}>To</span>
      <span className={styles.centered}>RPE</span>
      <span />
    </div>
  );
}
