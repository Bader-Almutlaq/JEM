import { describe, expect, test } from 'vitest';
import type { WorkoutSet } from '../models/WorkoutSet';
import type { Exercise } from '../models/Exercise';
import type { TemplateSetDraft } from '../templates/TemplateDraft';
import { toKilograms, valueIn } from '../units/Weight';
import { progressionPlan } from './ProgressionPlan';

const exercise: Pick<Exercise, 'tracking' | 'equipment' | 'defaultEntryUnit'> = {
  tracking: 'weight-reps',
  equipment: 'barbell',
  defaultEntryUnit: 'kg',
};
const target: TemplateSetDraft = { kind: 'working', targetRepsLow: 8, targetRepsHigh: 12, targetRpe: 8 };
function previous(
  reps: readonly number[],
  weightKilograms = 100,
  rpe: number | null = null,
): Pick<WorkoutSet, 'kind' | 'weightKilograms' | 'reps' | 'rpe'>[] {
  return reps.map((count) => ({ kind: 'working', weightKilograms, reps: count, rpe }));
}
function plan(reps: readonly number[], rpe: number | null = null) {
  return progressionPlan(
    previous(reps, 100, rpe),
    reps.map(() => target),
    exercise,
  );
}

describe('double progression, hand-computed examples', () => {
  test('100 × [12,12,11] stays at 100 × [12,12,12]', () => {
    expect(plan([12, 12, 11]).map((set) => [set?.weightKilograms, set?.reps])).toEqual([
      [100, 12],
      [100, 12],
      [100, 12],
    ]);
  });
  test('all sets at 12 and target RPE 8 advance to 102.5 × 8', () => {
    expect(plan([12, 12, 12], 8).map((set) => [set?.weightKilograms, set?.reps, set?.reason])).toEqual(
      Array.from({ length: 3 }, () => [102.5, 8, 'add-load']),
    );
  });
  test('unknown effort permits the same load jump', () => {
    expect(plan([12])[0]).toMatchObject({ weightKilograms: 102.5, reps: 8 });
  });
  test('22.5 kg dumbbells advance to 25 × 8', () => {
    expect(
      progressionPlan(previous([12, 12], 22.5), [target, target], { ...exercise, equipment: 'dumbbell' })[0],
    ).toMatchObject({ weightKilograms: 25, reps: 8 });
  });
  test.each([8, 11, 12])('RPE 9.5 above target repeats %i reps at 100 kg', (reps) => {
    expect(plan([reps], 9.5)[0]).toMatchObject({ weightKilograms: 100, reps, reason: 'above-target-rpe' });
  });
  test('one above-target set blocks the exercise-wide load jump', () => {
    const old = [...previous([12], 100, 8), ...previous([12], 100, 9.5)];
    expect(progressionPlan(old, [target, target], exercise).map((set) => set?.weightKilograms)).toEqual([100, 100]);
  });
  test('below range suggests the minimum, even when effort was above target', () => {
    expect(plan([5], 9.5)[0]).toMatchObject({ weightKilograms: 100, reps: 8, reason: 'below-range' });
  });
  test('lb equipment steps by 5 lb, retaining exact kg', () => {
    const result = progressionPlan(previous([12], toKilograms(100, 'lb')), [target], {
      ...exercise,
      defaultEntryUnit: 'lb',
    })[0];
    expect(result?.weightKilograms).toBe(toKilograms(45, 'lb') + 12 * toKilograms(5, 'lb'));
    expect(valueIn(result?.weightKilograms ?? 0, 'lb')).toBeCloseTo(105);
    expect(result?.reps).toBe(8);
  });
  test('bodyweight adds reps only, then repeats at the upper bound', () => {
    const result = progressionPlan(previous([10, 12], -10), [target, target], {
      ...exercise,
      tracking: 'bodyweight-reps',
    });
    expect(result.map((set) => [set?.weightKilograms, set?.reps])).toEqual([
      [null, 11],
      [null, 12],
    ]);
    expect(progressionPlan(previous([12]), [target], { ...exercise, tracking: 'bodyweight-reps' })[0]).toMatchObject({
      weightKilograms: null,
      reps: 12,
      reason: 'top-range',
    });
  });
  test('no prior session produces no suggestion', () => {
    expect(progressionPlan([], [target, target], exercise)).toEqual([null, null]);
  });
  test('warm-ups neither get suggestions nor block a load jump', () => {
    expect(
      progressionPlan(
        [{ kind: 'warmup', weightKilograms: 20, reps: 3, rpe: 10 }, ...previous([12])],
        [{ ...target, kind: 'warmup' }, target],
        exercise,
      ),
    ).toMatchObject([null, { weightKilograms: 102.5, reps: 8 }]);
  });
  test('each position uses its own range, weight and effort target', () => {
    expect(
      progressionPlan(
        [...previous([5], 100, 8), ...previous([10], 80, 9)],
        [
          { ...target, targetRepsLow: 3, targetRepsHigh: 5 },
          { ...target, targetRepsHigh: 10, targetRpe: 9 },
        ],
        exercise,
      ),
    ).toMatchObject([
      { weightKilograms: 102.5, reps: 3 },
      { weightKilograms: 82.5, reps: 8 },
    ]);
  });
  test('missing current or previous positions block load progression', () => {
    expect(progressionPlan(previous([12]), [target, target], exercise)).toMatchObject([{ weightKilograms: 100 }, null]);
    expect(progressionPlan(previous([12, 11]), [target], exercise)[0]?.weightKilograms).toBe(100);
  });
  test('off-ladder previous loads advance to an actually loadable weight', () => {
    expect(progressionPlan(previous([12], 101.1), [target], exercise)[0]?.weightKilograms).toBe(102.5);
  });
  test('custom load steps are honored', () => {
    expect(
      progressionPlan(previous([12], 100), [target], { ...exercise, loadStepKilograms: 1.25 })[0]?.weightKilograms,
    ).toBe(101.25);
  });
  test('unrestricted equipment repeats at top without inventing a step', () => {
    expect(progressionPlan(previous([12]), [target], { ...exercise, equipment: null })[0]).toMatchObject({
      weightKilograms: 100,
      reps: 12,
    });
  });
  const unsupportedTrackings: readonly Exercise['tracking'][] = ['duration', 'weight-duration'];
  test.each(unsupportedTrackings)('%s tracking never gets suggestions', (tracking) => {
    expect(progressionPlan(previous([12]), [target], { ...exercise, tracking })).toEqual([null]);
  });
  test('missing or invalid ranges produce no suggestion and never mutate inputs', () => {
    const old = previous([12]);
    const targets = [{ ...target, targetRepsHigh: null }];
    const before = JSON.stringify({ old, targets });
    expect(progressionPlan(old, targets, exercise)).toEqual([null]);
    expect(progressionPlan(old, [{ ...target, targetRepsLow: 0 }], exercise)).toEqual([null]);
    expect(JSON.stringify({ old, targets })).toBe(before);
  });
});

test('uses the upper RPE target as the progression limit', () => {
  const range = { ...target, targetRpeHigh: 9 };
  expect(progressionPlan(previous([12], 100, 9), [range], exercise)[0]?.reason).toBe('add-load');
  expect(progressionPlan(previous([12], 100, 9.5), [range], exercise)[0]?.reason).toBe('above-target-rpe');
});
