import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../prefersReducedMotion';

/**
 * Heuristic: sheets and dialogs leave faster than they arrive, so the next action is never held up.
 * Must equal `--motion-close` in tokens.css, which the closing animation in each module uses.
 */
export const DialogMotion = Object.freeze({ closeMilliseconds: 150 });

/**
 * Plays a dialog's closing animation before it is removed. `requestClose(action)` marks the dialog closing
 * (CSS reads `data-closing`) and runs `action` once the animation has finished; with reduced motion it runs
 * at once, and a second request while closing is ignored. The timer is cleared if the dialog unmounts first.
 */
export function useAnimatedClose() {
  const [isClosing, setIsClosing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );
  const requestClose = (action: () => void) => {
    if (isClosing) return;
    if (prefersReducedMotion()) {
      action();
      return;
    }
    setIsClosing(true);
    timer.current = window.setTimeout(action, DialogMotion.closeMilliseconds);
  };
  return { isClosing, requestClose };
}
