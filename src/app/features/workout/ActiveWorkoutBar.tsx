import { ChevronDown } from 'lucide-react';
import { useSwipeDown } from '../../design/gestures/useSwipeDown';
import styles from './ActiveWorkoutBar.module.css';
import { ElapsedClock } from './ElapsedClock';
import { minimizeWorkout } from './workoutMinimized';

/**
 * The bar that stays at the top while the sets scroll: minimize, the clock and Finish. Swiping the bar down
 * (or tapping the chevron) puts the workout away to show the rest of the app.
 */
export function ActiveWorkoutBar({
  startedAt,
  onFinish,
}: {
  readonly startedAt: string;
  readonly onFinish: () => void;
}) {
  const swipe = useSwipeDown(minimizeWorkout);
  return (
    <div className={styles.bar} {...swipe}>
      <span className={styles.grabber} aria-hidden="true" />
      <div className={styles.start}>
        <button type="button" className={styles.minimize} aria-label="Minimize workout" onClick={minimizeWorkout}>
          <ChevronDown size={22} strokeWidth={2} aria-hidden />
        </button>
        <ElapsedClock startedAt={startedAt} />
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.finish} onClick={onFinish}>
          Finish
        </button>
      </div>
    </div>
  );
}
