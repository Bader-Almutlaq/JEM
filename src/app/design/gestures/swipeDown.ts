/** Heuristic: how far a finger must travel down, and how vertical the path must be, to count as a deliberate swipe. */
export const SwipeDownLimits = Object.freeze({ distancePixels: 56, verticalToHorizontalRatio: 1.5 });

/** Whether a drag of (`dx`, `dy`) pixels from where it started is a swipe down: far enough, and mostly vertical. */
export function isSwipeDown(dx: number, dy: number): boolean {
  return dy >= SwipeDownLimits.distancePixels && dy >= Math.abs(dx) * SwipeDownLimits.verticalToHorizontalRatio;
}
