import type { WorkoutSet } from '../models/WorkoutSet';
import { isWorkSetKind } from '../models/SetKind';

/** Heaviest completed-history working/drop/failure set; callers supply completed sets in logged order.
 * Heuristic: ties use more reps, then the earlier logged set, matching Exercise Progress (T-077).
 * Missing rep metadata acts as zero for load-only callers. Empty/warm-up-only input returns undefined;
 * added/assisted bodyweight loads retain their signed kilograms.
 */
export function topWorkingSet<T extends Pick<WorkoutSet, 'kind' | 'weightKilograms'> & { readonly reps?: number }>(
  sets: readonly T[],
): T | undefined {
  return sets.reduce<T | undefined>((best, set) => {
    if (!isWorkSetKind(set.kind)) return best;
    return best === undefined ||
      set.weightKilograms > best.weightKilograms ||
      (set.weightKilograms === best.weightKilograms && (set.reps ?? 0) > (best.reps ?? 0))
      ? set
      : best;
  }, undefined);
}
