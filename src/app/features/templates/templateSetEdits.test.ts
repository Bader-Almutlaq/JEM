import { describe, expect, test } from 'vitest';
import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import type { TargetCell } from './TargetCell';
import { NEW_TEMPLATE_DRAFT, withExercisesAdded } from './templateExerciseEdits';
import {
  BLANK_SET,
  nextKind,
  nextTargetCell,
  targetValue,
  withKindCycled,
  withSetAdded,
  withSetRemoved,
  withTarget,
} from './templateSetEdits';

const draft: TemplateDraft = withExercisesAdded(NEW_TEMPLATE_DRAFT, [10, 20]);

function cell(exerciseIndex: number, setIndex: number, field: TargetCell['field']): TargetCell {
  return { exerciseIndex, setIndex, field };
}

describe('template set edits', () => {
  test('A new exercise starts with one blank set', () => {
    expect(draft.exercises[0]?.sets).toEqual([BLANK_SET]);
  });

  test('Adding a set copies the last one, and only in that exercise', () => {
    const targeted = withTarget(draft, cell(0, 0, 'repsLow'), 8);
    const added = withSetAdded(targeted, 0);
    expect(added.exercises[0]?.sets).toHaveLength(2);
    expect(added.exercises[0]?.sets[1]?.targetRepsLow).toBe(8);
    expect(added.exercises[1]?.sets).toHaveLength(1);
  });

  test('Removing a set closes the gap, but the last set of an exercise stays', () => {
    const three = withSetAdded(withSetAdded(withTarget(draft, cell(0, 0, 'repsLow'), 5), 0), 0);
    const without = withSetRemoved(withTarget(three, cell(0, 1, 'repsLow'), 9), 0, 0);
    expect(without.exercises[0]?.sets.map((set) => set.targetRepsLow)).toEqual([9, 5]);
    expect(withSetRemoved(draft, 0, 0)).toEqual(draft);
  });

  test('Tapping the kind steps Working, Warm-up, Drop, Failure and back to Working', () => {
    expect(nextKind('working')).toBe('warmup');
    expect(nextKind('warmup')).toBe('drop');
    expect(nextKind('drop')).toBe('failure');
    expect(nextKind('failure')).toBe('working');
    expect(withKindCycled(draft, 1, 0).exercises[1]?.sets[0]?.kind).toBe('warmup');
  });

  test('A target is written to its own field and can be cleared', () => {
    const written = withTarget(withTarget(draft, cell(0, 0, 'repsHigh'), 12), cell(0, 0, 'rpe'), 8.5);
    expect(written.exercises[0]?.sets[0]).toMatchObject({ targetRepsLow: null, targetRepsHigh: 12, targetRpe: 8.5 });
    expect(targetValue(written, cell(0, 0, 'rpe'))).toBe(8.5);
    expect(targetValue(withTarget(written, cell(0, 0, 'rpe'), null), cell(0, 0, 'rpe'))).toBeNull();
  });

  test('A cell that does not exist holds nothing', () => {
    expect(targetValue(draft, cell(5, 0, 'rpe'))).toBeNull();
  });

  test('Next walks low reps, high reps, RPE, then the next set and the next exercise', () => {
    const two = withSetAdded(draft, 0);
    expect(nextTargetCell(two, cell(0, 0, 'repsLow'))).toEqual(cell(0, 0, 'repsHigh'));
    expect(nextTargetCell(two, cell(0, 0, 'repsHigh'))).toEqual(cell(0, 0, 'rpe'));
    expect(nextTargetCell(two, cell(0, 0, 'rpe'))).toEqual(cell(0, 1, 'repsLow'));
    expect(nextTargetCell(two, cell(0, 1, 'rpe'))).toEqual(cell(1, 0, 'repsLow'));
    expect(nextTargetCell(two, cell(1, 0, 'rpe'))).toBeUndefined();
  });
});

test('warm-ups insert and move at the group boundary', () => {
  const two = withSetAdded(draft, 0);
  const warm = withSetAdded(two, 0, 'warmup');
  expect(warm.exercises[0]?.sets.map((set) => set.kind)).toEqual(['warmup', 'working', 'working']);
  const moved = withKindCycled(warm, 0, 2);
  expect(moved.exercises[0]?.sets.map((set) => set.kind)).toEqual(['warmup', 'warmup', 'working']);
  expect(withKindCycled(moved, 0, 0).exercises[0]?.sets.map((set) => set.kind)).toEqual(['warmup', 'drop', 'working']);
});

test('individual RPE edits preserve a compatible high end and clear an incompatible one', () => {
  const exercise = draft.exercises[0];
  const set = exercise?.sets[0];
  if (exercise === undefined || set === undefined) throw new Error('Missing fixture');
  const ranged = { ...draft, exercises: [{ ...exercise, sets: [{ ...set, targetRpe: 8, targetRpeHigh: 9 }] }] };
  expect(withTarget(ranged, cell(0, 0, 'rpe'), 8.5).exercises[0]?.sets[0]?.targetRpeHigh).toBe(9);
  expect(withTarget(ranged, cell(0, 0, 'rpe'), 9.5).exercises[0]?.sets[0]?.targetRpeHigh).toBeNull();
});
