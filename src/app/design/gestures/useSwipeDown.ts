import { useEffect, useRef, type PointerEvent } from 'react';
import { isSwipeDown } from './swipeDown';

/**
 * A pointer-down handler that calls `onSwipe` once when the pointer is dragged down far enough. Spread it on the
 * element to swipe on, and give that element `touch-action: none` so the browser does not claim the drag for scrolling.
 * The drag is followed on the window, so it still counts after the pointer has left the element, and buttons inside
 * the element keep working for plain taps.
 */
export function useSwipeDown(onSwipe: () => void) {
  const stop = useRef<() => void>(() => undefined);
  useEffect(() => () => stop.current(), []);
  return {
    onPointerDown: (event: PointerEvent) => {
      stop.current();
      const start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      const move = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== start.id) return;
        if (!isSwipeDown(next.clientX - start.x, next.clientY - start.y)) return;
        stop.current();
        onSwipe();
      };
      const end = (next: globalThis.PointerEvent) => {
        if (next.pointerId === start.id) stop.current();
      };
      stop.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        stop.current = () => undefined;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
  };
}
