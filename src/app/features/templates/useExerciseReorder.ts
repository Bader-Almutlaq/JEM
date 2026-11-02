import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** Heuristic: how close to the top or bottom of the screen a drag must be to scroll, and how far each frame scrolls. */
const EdgeScroll = Object.freeze({ zonePixels: 110, stepPixels: 14 });

/**
 * Dragging an exercise card by its handle. While the pointer is held, the card follows it: each time the
 * pointer is over another card, the exercise takes that card's place (`moveTo`). Cards carry
 * `data-exercise-index`; the page scrolls when the pointer nears its top or bottom edge. Returns which
 * exercise is lifted, and a pointer-down handler for each handle.
 */
export function useExerciseReorder(moveTo: (from: number, to: number) => void) {
  const [lifted, setLifted] = useState<number | undefined>(undefined);
  const cleanup = useRef<() => void>(() => undefined);
  useEffect(() => () => cleanup.current(), []);

  const start = (event: PointerEvent, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanup.current();
    const pointerId = event.pointerId;
    let current = index;
    let y = event.clientY;
    let frame = 0;
    setLifted(index);

    const scroll = () => {
      if (y < EdgeScroll.zonePixels) window.scrollBy(0, -EdgeScroll.stepPixels);
      else if (y > window.innerHeight - EdgeScroll.zonePixels) window.scrollBy(0, EdgeScroll.stepPixels);
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);

    const hover = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      next.preventDefault();
      y = next.clientY;
      const card = document.elementFromPoint(next.clientX, next.clientY)?.closest('[data-exercise-index]');
      const target = card instanceof HTMLElement ? Number(card.dataset.exerciseIndex) : undefined;
      if (target === undefined || Number.isNaN(target) || target === current) return;
      // Safe to call from a later event: the editor folds each move into its latest draft.
      moveTo(current, target);
      current = target;
      setLifted(target);
    };
    const preventScroll = (touch: TouchEvent) => touch.preventDefault();
    const end = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointerId) cleanup.current();
    };
    cleanup.current = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', hover);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchmove', preventScroll);
      setLifted(undefined);
      cleanup.current = () => undefined;
    };
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('pointermove', hover, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return { lifted, start };
}
