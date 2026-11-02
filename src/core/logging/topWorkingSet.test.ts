import { expect, test } from 'vitest';
import type { WorkoutSet } from '../models/WorkoutSet';
import { topWorkingSet } from './topWorkingSet';

test('heaviest then most reps then logged order, excluding warm-ups', () => {
  const sets: Pick<WorkoutSet, 'kind' | 'weightKilograms' | 'reps'>[] = [
    { kind: 'warmup', weightKilograms: 200, reps: 20 },
    { kind: 'working', weightKilograms: 100, reps: 10 },
    { kind: 'drop', weightKilograms: 80, reps: 20 },
    { kind: 'failure', weightKilograms: 100, reps: 12 },
    { kind: 'working', weightKilograms: 100, reps: 12 },
  ];
  expect(topWorkingSet(sets)).toBe(sets[3]);
  expect(topWorkingSet([])).toBeUndefined();
  expect(topWorkingSet(sets.slice(0, 1))).toBeUndefined();
});
test('negative assisted loads and load-only callers retain their actual top set', () => {
  const sets: Pick<WorkoutSet, 'kind' | 'weightKilograms'>[] = [
    { kind: 'working', weightKilograms: -20 },
    { kind: 'working', weightKilograms: -10 },
  ];
  expect(topWorkingSet(sets)).toBe(sets[1]);
});
