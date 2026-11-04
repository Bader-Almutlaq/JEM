/** What to do while one pointer is followed across the window. */
export interface PointerFollowHandlers {
  /** Each move of the followed pointer; moves of other fingers are ignored. */
  readonly onMove?: (event: PointerEvent) => void;
  /** The followed pointer's `pointerup` or `pointercancel`, called once just before following stops. */
  readonly onEnd?: (event: PointerEvent) => void;
  /**
   * While this returns true, touch scrolling is held off (and moves may call `preventDefault`). iOS Safari only
   * honours that from non-passive `touchmove` listeners, so a drag that must not scroll the page needs it.
   */
  readonly blocksScroll?: () => boolean;
}

/**
 * Follows one pointer on the window from its `pointerdown` until it lifts or is cancelled, so a swipe or drag keeps
 * working after the finger leaves the element it started on. Every swipe and drag uses this, so iOS touch fixes are
 * made once. Returns `stop`, which removes every listener; calling it again does nothing.
 */
export function followPointer(pointerId: number, handlers: PointerFollowHandlers): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const stop = () => controller.abort();
  const { onMove, onEnd, blocksScroll } = handlers;
  const isFollowed = (event: PointerEvent) => event.pointerId === pointerId;
  const end = (event: PointerEvent) => {
    if (!isFollowed(event)) return;
    onEnd?.(event);
    stop();
  };
  window.addEventListener(
    'pointermove',
    (event) => {
      if (isFollowed(event)) onMove?.(event);
    },
    { signal, passive: blocksScroll === undefined },
  );
  window.addEventListener('pointerup', end, { signal });
  window.addEventListener('pointercancel', end, { signal });
  if (blocksScroll !== undefined) {
    window.addEventListener(
      'touchmove',
      (event) => {
        if (blocksScroll()) event.preventDefault();
      },
      { signal, passive: false },
    );
  }
  return stop;
}
