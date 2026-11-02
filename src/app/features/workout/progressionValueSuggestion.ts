import type { WorkoutSet } from '../../../core/models/WorkoutSet';
import type { ProgressionSuggestion } from '../../../core/logging/ProgressionPlan';
import { valueIn, WeightTolerance } from '../../../core/units/Weight';
import { weightNumberText } from '../../format/weightText';
import type { ValueSuggestion } from './ValueSuggestion';

/**
 * Formats an opt-in value in this cell's unit; changed baselines stay untouched after a reload.
 * Only the text is rounded: acceptance uses exact unit load so kg overrides survive lb display.
 */
export function progressionValueSuggestion(
  progression: Pick<ProgressionSuggestion, 'weightKilograms' | 'reps' | 'suggestReps'>,
  set: WorkoutSet,
  previous: WorkoutSet,
  field: 'weight' | 'reps',
  onAccept: (value: number) => void,
): ValueSuggestion | undefined {
  const untouched =
    field === 'weight'
      ? Math.abs(set.weightKilograms - previous.weightKilograms) <= WeightTolerance.floatingPoint
      : set.reps === previous.reps;
  if (field === 'reps' && progression.suggestReps === false) return undefined;
  if (!untouched || (field === 'weight' && progression.weightKilograms === null)) return undefined;
  return {
    value: field === 'weight' ? valueIn(progression.weightKilograms ?? 0, set.entryUnit) : progression.reps,
    text:
      field === 'weight' ? weightNumberText(progression.weightKilograms ?? 0, set.entryUnit) : String(progression.reps),
    keepsPrevious: true,
    onAccept,
  };
}
