import { topWorkingSet } from './topWorkingSet';
import type { Exercise } from '../models/Exercise';
import type { WorkoutSet } from '../models/WorkoutSet';
import { loadProfileFor } from '../units/LoadableWeight';
import type { WeightUnit } from '../units/WeightUnit';
import type { ProgressionMode } from './ProgressionMode';

/** Heuristic: Fine compound jumps use ≤2.5%, conservatively inside report item 5's 4% cutoff.
 * Source: reports/Workout tracker app research.md, "Coarse weight jumps need double progression", items 5–6.
 */
const AutomaticProgression = Object.freeze({ maximumLoadFraction: 0.025 });

/** Resolves a stored preference, preserving legacy double rows. Fine barbell/trap-bar compounds
 * use weight first at a positive historical working load; all others use reps first.
 * Bodyweight and timed tracking always resolve to reps first unless explicitly off; timed plans
 * remain unsupported by progressionPlan. `unit` chooses the same ladder as the pending set.
 */
export function resolveProgressionMode(
  exercise: Pick<
    Exercise,
    'tracking' | 'equipment' | 'defaultEntryUnit' | 'loadStepKilograms' | 'barWeightKilograms'
  > & {
    readonly mechanic?: Exercise['mechanic'];
  },
  previous: readonly Pick<WorkoutSet, 'kind' | 'weightKilograms'>[],
  preference: { readonly progressionMode?: ProgressionMode | null; readonly progression?: 'double' | null } = {},
  unit: WeightUnit = exercise.defaultEntryUnit,
): ProgressionMode {
  if (preference.progressionMode === 'off') return 'off';
  if (exercise.tracking !== 'weight-reps') return 'reps-first';
  if (preference.progressionMode !== undefined && preference.progressionMode !== null)
    return preference.progressionMode;
  if (preference.progression === 'double') return 'reps-first';
  const weight = topWorkingSet(previous)?.weightKilograms ?? 0;
  const step = loadProfileFor(exercise, unit).stepKilograms;
  return exercise.mechanic === 'compound' &&
    (exercise.equipment === 'barbell' || exercise.equipment === 'trap-bar') &&
    weight > 0 &&
    step !== null &&
    step / weight <= AutomaticProgression.maximumLoadFraction
    ? 'weight-first'
    : 'reps-first';
}
