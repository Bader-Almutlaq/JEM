import { topWorkingSet } from './topWorkingSet';
import type { ProgressionMode } from './ProgressionMode';
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
  /** False for a position without its own range: only the exercise's load rule applies. */
  readonly suggestReps?: boolean;
  readonly reason:
    'below-range' | 'add-rep' | 'add-load' | 'above-target-rpe' | 'top-range' | 'repeat-load' | 'rpe-rising';
}

/** Heuristic: one rep at a time, per the owner's T-060 double-progression rule. */
const ProgressionSteps = Object.freeze({ reps: 1, holdSessions: 3 });

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

/** Heuristic: the owner's last-three-session hold. Newest first, top means heaviest work set,
 * breaking ties by reps then logged order (the existing Exercise Progress convention).
 * Hold only with three known, rising then nondecreasing RPEs, the latest two at/above the latest top's
 * target ceiling. Unknown effort/target cannot establish a rising trend. No load decrease is inferred.
 */
export function progressionLoadHeld(
  history: readonly (readonly PreviousSet[])[],
  targets: readonly TemplateSetDraft[],
): boolean {
  if (history.length < ProgressionSteps.holdSessions) return false;
  const tops = history.slice(0, ProgressionSteps.holdSessions).map((session) => {
    const set = topWorkingSet(session);
    return set === undefined
      ? undefined
      : {
          set,
          index: session.filter((item) => item.kind !== 'warmup').indexOf(set),
        };
  });
  const [latest, middle, oldest] = tops;
  if (latest === undefined || middle === undefined || oldest === undefined) return false;
  const target = targets.filter((set) => set.kind !== 'warmup')[latest.index];
  const limit = target?.targetRpeHigh ?? target?.targetRpe;
  const first = oldest.set.rpe;
  const second = middle.set.rpe;
  const third = latest.set.rpe;
  return (
    limit !== undefined &&
    limit !== null &&
    first !== null &&
    second !== null &&
    third !== null &&
    first < second &&
    second <= third &&
    second >= limit &&
    third >= limit
  );
}

/**
 * Reps-first or weight-first progression, aligned to target positions (null without history/ranges).
 * Uses completed non-warm-up sets in their supplied order; drop/failure sets count as work.
 * Source: reports/Workout tracker app research.md, "Coarse weight jumps need double progression".
 * Heuristic: the owner's T-060 rule adds one rep up to high, then one loadable step only when
 * every planned working position has reached its own high at/below target RPE (unknown permits it).
 * Above-target effort repeats in-range reps; below-range reps rise to low first. Bodyweight
 * repeats at the top without suggesting a load. Unrestricted equipment repeats there too.
 * Weight first adds a load step when every matched working set meets its low bound and known
 * effort is at/below its ceiling (no ceiling needs no effort evidence), retaining in-range reps.
 * Heuristic: missing per-set ranges borrow the first complete working range for load rules only;
 * no rep suggestion is emitted for those positions. Off and timed exercises produce no values.
 * `holdLoad` blocks an otherwise qualifying load jump, retaining its previous reps; it never blocks
 * a reps-only increase. The three-session history determines that flag.
 * `unit` selects the equipment's ladder, never converts or rounds stored historical kilograms.
 */
export function progressionPlan(
  previous: readonly PreviousSet[],
  targets: readonly TemplateSetDraft[],
  exercise: ProgressionExercise,
  unit: WeightUnit = exercise.defaultEntryUnit,
  mode: ProgressionMode = 'reps-first',
  holdLoad = false,
): (ProgressionSuggestion | null)[] {
  if (mode === 'off' || (exercise.tracking !== 'weight-reps' && exercise.tracking !== 'bodyweight-reps'))
    return targets.map(() => null);
  const weightFirst = mode === 'weight-first' && exercise.tracking === 'weight-reps';
  const work = previous.filter((set) => set.kind !== 'warmup');
  const workTargets = targets.filter((set) => set.kind !== 'warmup');
  const exerciseRange = workTargets.find(hasRange);
  const effectiveTargets = workTargets.map((target) => {
    const missingRange = target.targetRepsLow === null || target.targetRepsHigh === null;
    return !missingRange || exerciseRange === undefined
      ? target
      : { ...target, targetRepsLow: exerciseRange.targetRepsLow, targetRepsHigh: exerciseRange.targetRepsHigh };
  });
  // Extra historical sets also block a load jump: reducing the plan must not hide a missed top set.
  const allReadyForLoad =
    work.length === workTargets.length &&
    workTargets.length > 0 &&
    effectiveTargets.every((target, index) => {
      const prior = work[index];
      return (
        prior !== undefined &&
        hasRange(target) &&
        prior.reps >= (weightFirst ? target.targetRepsLow : target.targetRepsHigh) &&
        effortAllowsProgress(prior, target) &&
        (!weightFirst || (target.targetRpeHigh ?? target.targetRpe) === null || prior.rpe !== null)
      );
    });
  const profile = loadProfileFor(exercise, unit);
  let workIndex = 0;
  return targets.map((target) => {
    if (target.kind === 'warmup') return null;
    const prior = work[workIndex];
    const effective = effectiveTargets[workIndex++];
    if (prior === undefined || effective === undefined || !hasRange(effective)) return null;
    const ownRange = hasRange(target);
    if (!ownRange && exercise.tracking === 'bodyweight-reps') return null;
    const repeatedReps = ownRange ? Math.min(prior.reps, effective.targetRepsHigh) : prior.reps;
    const base = {
      weightKilograms: exercise.tracking === 'bodyweight-reps' ? null : prior.weightKilograms,
      previousWeightKilograms: prior.weightKilograms,
      reps: prior.reps,
      targetRepsLow: effective.targetRepsLow,
      targetRepsHigh: effective.targetRepsHigh,
      suggestReps: ownRange,
    };
    if (ownRange && prior.reps < effective.targetRepsLow)
      return { ...base, reps: effective.targetRepsLow, reason: 'below-range' };
    if (!effortAllowsProgress(prior, effective)) return { ...base, reason: 'above-target-rpe' };
    if (allReadyForLoad && exercise.tracking === 'weight-reps' && profile.stepKilograms !== null) {
      const next = roundToLoadable(prior.weightKilograms + profile.stepKilograms, profile, 'nearest');
      if (next > prior.weightKilograms + WeightTolerance.floatingPoint) {
        if (holdLoad) return { ...base, reason: 'rpe-rising' };
        return {
          ...base,
          weightKilograms: next,
          reps: weightFirst || !ownRange ? repeatedReps : effective.targetRepsLow,
          reason: 'add-load',
        };
      }
    }
    if (weightFirst || !ownRange)
      return {
        ...base,
        reps: repeatedReps,
        reason: 'repeat-load',
      };
    if (prior.reps < effective.targetRepsHigh) {
      return {
        ...base,
        reps: Math.min(prior.reps + ProgressionSteps.reps, effective.targetRepsHigh),
        reason: 'add-rep',
      };
    }
    return { ...base, reason: 'top-range' };
  });
}
