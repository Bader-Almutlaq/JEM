import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';

/** Tiny resolved mode tag shown only inside the live exercise options sheet. */
export function progressionText(entry: LiveWorkoutEntry): string | undefined {
  if (entry.progression === undefined || entry.progression.mode === 'off') return undefined;
  return entry.progression.mode === 'weight-first' ? '+kg first' : '+reps first';
}
