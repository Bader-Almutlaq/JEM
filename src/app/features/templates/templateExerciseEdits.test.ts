import { describe, expect, test } from 'vitest';
import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import {
  isSupersetWithNext,
  NEW_TEMPLATE_DRAFT,
  withExerciseMoved,
  withExerciseMovedTo,
  withExerciseRemoved,
  withExercisesAdded,
  withSupersetToggled,
} from './templateExerciseEdits';

/** Exercise ids in order, with a letter-free summary of their superset groups. */
function ids(draft: TemplateDraft): number[] {
  return draft.exercises.map((exercise) => exercise.exerciseId);
}

function groups(draft: TemplateDraft): (number | null)[] {
  return draft.exercises.map((exercise) => exercise.supersetGroup);
}

const four = withExercisesAdded(NEW_TEMPLATE_DRAFT, [1, 2, 3, 4]);

describe('template exercise edits', () => {
  test('Exercises are appended in the order picked, with no superset', () => {
    expect(ids(four)).toEqual([1, 2, 3, 4]);
    expect(groups(four)).toEqual([null, null, null, null]);
    expect(ids(withExercisesAdded(four, [9]))).toEqual([1, 2, 3, 4, 9]);
  });

  test('Joining an exercise with the next makes a superset, and doing it again splits it', () => {
    const joined = withSupersetToggled(four, 1);
    expect(groups(joined)).toEqual([null, 1, 1, null]);
    expect(isSupersetWithNext(joined, 1)).toBe(true);
    expect(isSupersetWithNext(joined, 0)).toBe(false);
    expect(groups(withSupersetToggled(joined, 1))).toEqual([null, null, null, null]);
  });

  test('The last exercise has no next to join', () => {
    expect(withSupersetToggled(four, 3)).toBe(four);
  });

  test('Joining into a superset grows it, and splitting the middle keeps the two halves', () => {
    const triple = withSupersetToggled(withSupersetToggled(four, 0), 1);
    expect(groups(triple)).toEqual([1, 1, 1, null]);
    expect(groups(withSupersetToggled(triple, 0))).toEqual([null, 1, 1, null]);
    const all = withSupersetToggled(triple, 2);
    expect(groups(all)).toEqual([1, 1, 1, 1]);
    expect(groups(withSupersetToggled(all, 1))).toEqual([1, 1, 2, 2]);
  });

  test('Joining two supersets merges them', () => {
    const pairs = withSupersetToggled(withSupersetToggled(four, 0), 2);
    expect(groups(pairs)).toEqual([1, 1, 2, 2]);
    expect(groups(withSupersetToggled(pairs, 1))).toEqual([1, 1, 1, 1]);
  });

  test('Removing an exercise dissolves a superset left with one member', () => {
    const joined = withSupersetToggled(four, 1);
    const removed = withExerciseRemoved(joined, 2);
    expect(ids(removed)).toEqual([1, 2, 4]);
    expect(groups(removed)).toEqual([null, null, null]);
  });

  test('Moving swaps neighbours and does nothing past either end', () => {
    expect(ids(withExerciseMoved(four, 1, -1))).toEqual([2, 1, 3, 4]);
    expect(ids(withExerciseMoved(four, 1, 1))).toEqual([1, 3, 2, 4]);
    expect(withExerciseMoved(four, 0, -1)).toBe(four);
    expect(withExerciseMoved(four, 3, 1)).toBe(four);
  });

  test('Moving within a superset keeps it together', () => {
    const joined = withSupersetToggled(four, 1);
    const moved = withExerciseMoved(joined, 1, 1);
    expect(ids(moved)).toEqual([1, 3, 2, 4]);
    expect(groups(moved)).toEqual([null, 1, 1, null]);
  });

  test('Moving past a whole superset jumps over it', () => {
    const joined = withSupersetToggled(four, 1);
    const moved = withExerciseMoved(joined, 0, 1);
    expect(ids(moved)).toEqual([2, 3, 1, 4]);
    expect(groups(moved)).toEqual([1, 1, null, null]);
    expect(ids(withExerciseMoved(joined, 3, -1))).toEqual([1, 4, 2, 3]);
  });

  test('Moving past the end of its own superset takes the exercise out of it', () => {
    const joined = withSupersetToggled(four, 1);
    const moved = withExerciseMoved(joined, 2, 1);
    expect(ids(moved)).toEqual([1, 2, 4, 3]);
    expect(groups(moved)).toEqual([null, null, null, null]);
  });
});

describe('withExerciseMovedTo', () => {
  test('moves an exercise down and up to the target place', () => {
    expect(ids(withExerciseMovedTo(four, 0, 3))).toEqual([2, 3, 4, 1]);
    expect(ids(withExerciseMovedTo(four, 3, 0))).toEqual([4, 1, 2, 3]);
    expect(ids(withExerciseMovedTo(four, 1, 2))).toEqual([1, 3, 2, 4]);
  });

  test('moving to its own place or past the ends changes nothing more than the ends allow', () => {
    expect(withExerciseMovedTo(four, 2, 2)).toBe(four);
    expect(ids(withExerciseMovedTo(four, 1, 9))).toEqual([1, 3, 4, 2]);
  });

  test('keeps the superset rules: a whole superset is jumped, and leaving one splits it', () => {
    const joined = withSupersetToggled(four, 1); // 2 and 3 are a superset
    expect(ids(withExerciseMovedTo(joined, 0, 3))).toEqual([2, 3, 4, 1]);
    expect(groups(withExerciseMovedTo(joined, 0, 3))).toEqual([1, 1, null, null]);
    expect(ids(withExerciseMovedTo(joined, 3, 0))).toEqual([4, 1, 2, 3]);
  });
});
