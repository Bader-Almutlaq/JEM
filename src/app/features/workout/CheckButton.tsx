import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { rpeNumberText } from '../../format/setText';
import styles from './CheckButton.module.css';

/** Heuristic: half a second distinguishes an intentional hold from a completion tap. */
const RPE_HOLD_MILLISECONDS = 500;

/** Heuristic: tolerate small finger movement; larger movement is a scroll/swipe, not an effort hold. */
const RPE_HOLD_SLOP_PIXELS = 8;

/** Completion control with an independent RPE badge; a hold edits effort without completing the set. */
export function CheckButton({
  isCompleted,
  onPress,
  isDisabled = false,
  rpe = null,
  onEditRpe,
}: {
  readonly isCompleted: boolean;
  readonly onPress: () => void;
  /** Finished workouts retain completion; their separate RPE cell remains editable. */
  readonly isDisabled?: boolean;
  readonly rpe?: number | null;
  readonly onEditRpe?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const pointerOrigin = useRef({ x: 0, y: 0 });
  const cancelHold = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className={styles.control}>
      <button
        type="button"
        className={styles.button}
        aria-label={isCompleted ? 'Completed' : 'Mark as completed'}
        aria-pressed={isCompleted}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          cancelHold();
          held.current = false;
          pointerOrigin.current = { x: event.clientX, y: event.clientY };
          if (onEditRpe === undefined) return;
          timer.current = setTimeout(() => {
            held.current = true;
            onEditRpe();
          }, RPE_HOLD_MILLISECONDS);
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onPointerMove={(event) => {
          const origin = pointerOrigin.current;
          if (
            Math.abs(event.clientX - origin.x) > RPE_HOLD_SLOP_PIXELS ||
            Math.abs(event.clientY - origin.y) > RPE_HOLD_SLOP_PIXELS
          )
            cancelHold();
        }}
        onContextMenu={(event) => {
          if (onEditRpe !== undefined) event.preventDefault();
        }}
        onClick={() => {
          if (!held.current) onPress();
          held.current = false;
        }}
        disabled={isDisabled}
      >
        <Check size={15} strokeWidth={2.75} aria-hidden />
      </button>
      {onEditRpe !== undefined && rpe !== null && (
        <button
          type="button"
          className={styles.badge}
          aria-label={`Edit RPE ${rpeNumberText(rpe)}`}
          onClick={onEditRpe}
        >
          {rpeNumberText(rpe)}
        </button>
      )}
    </div>
  );
}
