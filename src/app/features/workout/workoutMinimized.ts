import { useSyncExternalStore } from 'react';

/**
 * Whether the workout in progress has been swiped down to reveal the rest of the app. It lives only as long as
 * the page: reopening the app shows the workout again, because a workout in progress is what the owner returns to.
 */
let minimized = false;
const listeners = new Set<() => void>();

/** Hides the workout screen (the Workout tab shows its normal start screen) until it is resumed. */
export function minimizeWorkout(): void {
  setMinimized(true);
}

/** Shows the workout screen again. */
export function resumeWorkout(): void {
  setMinimized(false);
}

function setMinimized(next: boolean): void {
  if (minimized === next) return;
  minimized = next;
  for (const listener of listeners) listener();
}

/** Whether the workout in progress is currently swiped away. */
export function useWorkoutMinimized(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => minimized,
    () => minimized,
  );
}
