import { X } from 'lucide-react';
import { RestTimerDefaults } from '../../../core/logging/RestTimer';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import styles from './RestBar.module.css';
import { RestBarButton } from './RestBarButton';
import { RestReadout } from './RestReadout';
import { useRestBar } from './useRestBar';

const step = RestTimerDefaults.stepSeconds;

/**
 * The rest bar above the tab bar: time since the last completed set, the exercise's rest target, a
 * step button each way and a dismiss cross. It is hidden while the number pad is open (`isHidden`),
 * which sits in the same place. It never makes a sound or a suggestion; the target is the owner's.
 */
export function RestBar({
  entries,
  isHidden,
}: {
  readonly entries: readonly LiveWorkoutEntry[];
  readonly isHidden: boolean;
}) {
  const model = useRestBar(entries);
  if (model === undefined || isHidden) return null;
  return (
    <div className={styles.dock}>
      <div className={styles.spacer} />
      <div className={styles.bar} role="group" aria-label="Rest timer">
        <progress
          className={styles.progress}
          aria-label="Rest progress to lower target"
          max={model.targetSeconds}
          value={Math.min(model.state.elapsedSeconds, model.targetSeconds)}
        />
        <RestReadout model={model} />
        <RestBarButton
          label={`Shorten rest target by ${step} seconds`}
          isDisabled={!model.canShorten}
          onPress={model.shorten}
        >
          −{step} s
        </RestBarButton>
        <RestBarButton
          label={`Lengthen rest target by ${step} seconds`}
          isDisabled={!model.canLengthen}
          onPress={model.lengthen}
        >
          +{step} s
        </RestBarButton>
        <RestBarButton label="Dismiss rest timer" onPress={model.dismiss}>
          <X size={18} strokeWidth={2} aria-hidden />
        </RestBarButton>
      </div>
    </div>
  );
}
