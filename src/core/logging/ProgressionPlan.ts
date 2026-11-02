import type { Exercise } from '../models/Exercise';
import type { WorkoutSet } from '../models/WorkoutSet';
import type { TemplateSetDraft } from '../templates/TemplateDraft';
import { loadProfileFor, roundToLoadable } from '../units/LoadableWeight';
import { WeightTolerance } from '../units/Weight';
import type { WeightUnit } from '../units/WeightUnit';

/** A descriptive calculation result; exact kg, whole reps, and null load for bodyweight. Never persisted. */
export interface ProgressionSuggestion {
  readonly weightKilograms: number | null;
  readonly previousWeightKilograms: number;
  readonly reps: number;
  readonly targetRepsLow: number;
  readonly targetRepsHigh: number;
  readonly reason: 'below-range' | 'add-rep' | 'add-load' | 'above-target-rpe' | 'top-range';
}

/** Heuristic: one rep at a time, per the owner's T-060 double-progression rule. */
const ProgressionSteps = Object.freeze({ reps: 1 });

type PreviousSet = Pick<WorkoutSet, 'kind' | 'weightKilograms' | 'reps' | 'rpe'>;
type ProgressionExercise = Pick<
  Exercise,
  'tracking' | 'equipment' | 'loadStepKilograms' | 'barWeightKilograms' | 'defaultEntryUnit'
>;

function hasRange(target: TemplateSetDraft): target is TemplateSetDraft & {
  readonly targetRepsLow: number;
  readonly targetRepsHigh: number;
} {
  return (
    target.targetRepsLow !== null &&
    target.targetRepsHigh !== null &&
    Number.isInteger(target.targetRepsLow) &&
    Number.isInteger(target.targetRepsHigh) &&
    target.targetRepsLow > 0 &&
    target.targetRepsHigh >= target.targetRepsLow
  );
}

function effortAllowsProgress(previous: PreviousSet, target: TemplateSetDraft): boolean {
  const limit = target.targetRpeHigh ?? target.targetRpe;
  return previous.rpe === null || limit === null || previous.rpe <= limit;
}

/**
 * Double progression, aligned to target positions (null for warm-ups/missing history or ranges).
 * Uses completed non-warm-up sets in their supplied order; drop/failure sets count as work.
 * Source: reports/Workout tracker app research.md, "Coarse weight jumps need double progression".
 * Heuristic: the owner's T-060 rule adds one rep up to high, then one loadable step only when
 * every planned working position has reached its own high at/below target RPE (unknown permits it).
 * Above-target effort repeats in-range reps; below-range reps rise to low first. Bodyweight
 * repeats at the top without suggesting a load. Unrestricted equipment repeats there too.
 * `unit` selects the equipment's ladder, never converts or rounds stored historical kilograms.
 */
export function progressionPlan(
  previous: readonly PreviousSet[],
  targets: readonly TemplateSetDraft[],
  exercise: ProgressionExercise,
  unit: WeightUnit = exercise.defaultEntryUnit,
): (ProgressionSuggestion | null)[] {
  if (exercise.tracking !== 'weight-reps' && exercise.tracking !== 'bodyweight-reps') return targets.map(() => null);
  const work = previous.filter((set) => set.kind !== 'warmup');
  const workTargets = targets.filter((set) => set.kind !== 'warmup');
  // Extra historical sets also block a load jump: reducing the plan must not hide a missed top set.
  const allAtTop =
    work.length === workTargets.length &&
    workTargets.length > 0 &&
    workTargets.every((target, index) => {
      const prior = work[index];
      return (
        prior !== undefined &&
        hasRange(target) &&
        prior.reps >= target.targetRepsHigh &&
        effortAllowsProgress(prior, target)
      );
    });
  const profile = loadProfileFor(exercise, unit);
  let workIndex = 0;
  return targets.map((target) => {
    if (target.kind === 'warmup') return null;
    const prior = work[workIndex++];
    if (prior === undefined || !hasRange(target)) return null;
    const base = {
      weightKilograms: exercise.tracking === 'bodyweight-reps' ? null : prior.weightKilograms,
      previousWeightKilograms: prior.weightKilograms,
      reps: prior.reps,
      targetRepsLow: target.targetRepsLow,
      targetRepsHigh: target.targetRepsHigh,
    };
    if (prior.reps < target.targetRepsLow) return { ...base, reps: target.targetRepsLow, reason: 'below-range' };
    if (!effortAllowsProgress(prior, target)) return { ...base, reason: 'above-target-rpe' };
    if (allAtTop && exercise.tracking === 'weight-reps' && profile.stepKilograms !== null) {
      const next = roundToLoadable(prior.weightKilograms + profile.stepKilograms, profile, 'nearest');
      if (next > prior.weightKilograms + WeightTolerance.floatingPoint) {
        return { ...base, weightKilograms: next, reps: target.targetRepsLow, reason: 'add-load' };
      }
    }
    if (prior.reps < target.targetRepsHigh) {
      return { ...base, reps: Math.min(prior.reps + ProgressionSteps.reps, target.targetRepsHigh), reason: 'add-rep' };
    }
    return { ...base, reason: 'top-range' };
  });
}
