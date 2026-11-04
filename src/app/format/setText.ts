import type { WorkoutSet } from '../../core/models/WorkoutSet';
import { FORMAT_LOCALE } from './formatLocale';

/** RPE allows half steps, so "8" and "8.5" but never "8.00". */
const rpeFormat = new Intl.NumberFormat(FORMAT_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/**
 * The label shown at the start of each set row: "W" for a warm-up, "D" for a drop set, "F" for a
 * set to failure, and the running number among the working sets (1, 2, 3…) for the rest.
 * Special sets don't consume a number, so a warm-up then two working sets read W, 1, 2.
 * Port of the native detail screen's labels.
 *
 * @param sets One exercise's sets in logged order.
 */
export function setLabels(sets: readonly Pick<WorkoutSet, 'kind'>[]): string[] {
  let workingCount = 0;
  return sets.map(({ kind }) => {
    switch (kind) {
      case 'warmup':
        return 'W';
      case 'drop':
        return 'D';
      case 'failure':
        return 'F';
      case 'working':
        workingCount += 1;
        return String(workingCount);
    }
  });
}

/** Just the number of an effort rating, e.g. "8.5", for set rows where the column says RPE. */
export function rpeNumberText(rpe: number): string {
  return rpeFormat.format(rpe);
}

/** An effort rating as text, e.g. "RPE 8.5". */
export function rpeText(rpe: number): string {
  return `RPE ${rpeNumberText(rpe)}`;
}

/** "1 set" or "12 sets". */
export function setCountText(count: number): string {
  return count === 1 ? '1 set' : `${count} sets`;
}

/** "1 warm-up" or "3 warm-ups". */
export function warmupCountText(count: number): string {
  return count === 1 ? '1 warm-up' : `${count} warm-ups`;
}

/** Effort suffix for a logged set; omit it when no RPE was recorded. */
export function loggedRpeSuffix(rpe: number | null): string {
  return rpe === null ? '' : ` @ ${rpeText(rpe)}`;
}
