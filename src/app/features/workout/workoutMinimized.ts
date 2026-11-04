import { useSyncExternalStore } from 'react';

/**
 * Which workout in progress has been swiped down to reveal the rest of the app, if any. It lives only as long as
 * the page: reopening the app shows the workout again, because a workout in progress is what the owner returns to.
 * Keeping the id (not a yes/no) means a finished workout's state can never carry over to the next one.
 */
let minimizedWorkoutId: number | undefined;
const listeners = new Set<() => void>();

function setMinimized(workoutId: number | undefined): void {
  if (minimizedWorkoutId === workoutId) return;
  minimizedWorkoutId = workoutId;
  for (const listener of listeners) listener();
}

/** Hides this workout's screen (the Workout tab shows its normal start screen) until it is resumed. */
export function minimizeWorkout(workoutId: number): void {
  setMinimized(workoutId);
}

/** Shows the workout screen again. */
export function resumeWorkout(): void {
  setMinimized(undefined);
}

/** Whether this workout in progress is currently swiped away; `undefined` (no workout) is never minimized. */
export function useWorkoutMinimized(workoutId: number | undefined): boolean {
  const minimized = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => minimizedWorkoutId,
    () => minimizedWorkoutId,
  );
  return workoutId !== undefined && minimized === workoutId;
}
