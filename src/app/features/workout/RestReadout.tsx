import { Check } from 'lucide-react';
import { clockText } from '../../format/clockText';
import type { RestBarModel } from './RestBarModel';
import styles from './RestReadout.module.css';

/**
 * "Rest 1:24 / 2:00" while counting. Once the target is reached the target drops out and a check
 * mark follows the time, in the quieter colour: "Rest 2:00 ✓". The time keeps counting up, so the rest
 * actually taken stays visible.
 */
export function RestReadout({ model }: { readonly model: RestBarModel }) {
  const { state, targetSeconds } = model;
  return (
    <span className={styles.readout} role="timer" aria-label="Rest time" data-reached={state.isTargetReached}>
      <span className={styles.label}>Rest</span>
      <span className={styles.elapsed}>
        {model.range?.phase === 'between'
          ? `+${clockText(model.range.overtimeSeconds)}`
          : clockText(state.elapsedSeconds)}
      </span>
      {state.isTargetReached ? (
        <Check size={16} strokeWidth={2} aria-label="Target reached" />
      ) : (
        <span className={styles.target}>/ {clockText(targetSeconds)}</span>
      )}
    </span>
  );
}
