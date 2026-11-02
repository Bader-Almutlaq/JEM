import { expect, test } from 'vitest';
import type { Exercise } from '../models/Exercise';
import type { WorkoutSet } from '../models/WorkoutSet';
import { toKilograms } from '../units/Weight';
import { resolveProgressionMode } from './resolveProgressionMode';

const squat: Pick<Exercise, 'tracking' | 'equipment' | 'mechanic' | 'defaultEntryUnit' | 'loadStepKilograms'> = {
  tracking: 'weight-reps',
  equipment: 'barbell',
  mechanic: 'compound',
  defaultEntryUnit: 'kg',
  loadStepKilograms: 2.5,
};
function previous(weightKilograms: number): Pick<WorkoutSet, 'kind' | 'weightKilograms'>[] {
  return [{ kind: 'working', weightKilograms }];
}
test('140 kg squat with a 2.5 kg step resolves to weight first (1.786%)', () => {
  expect(resolveProgressionMode(squat, previous(140))).toBe('weight-first');
});
test('100 kg at 2.5% is included; 99 kg exceeds the cutoff', () => {
  expect(resolveProgressionMode(squat, previous(100))).toBe('weight-first');
  expect(resolveProgressionMode(squat, previous(99))).toBe('reps-first');
});
test('16 kg dumbbell curl with a 2 kg step resolves to reps first (12.5%)', () => {
  expect(
    resolveProgressionMode(
      { ...squat, equipment: 'dumbbell', mechanic: 'isolation', loadStepKilograms: 2 },
      previous(16),
    ),
  ).toBe('reps-first');
});
test.each(['machine', 'cable', 'smith-machine', 'dumbbell'] as const)(
  '%s stays reps first even with fine steps',
  (equipment) => {
    expect(resolveProgressionMode({ ...squat, equipment, loadStepKilograms: 1 }, previous(140))).toBe('reps-first');
  },
);
test('trap-bar compound qualifies but barbell isolation and unclassified movement do not', () => {
  expect(resolveProgressionMode({ ...squat, equipment: 'trap-bar' }, previous(140))).toBe('weight-first');
  expect(resolveProgressionMode({ ...squat, mechanic: 'isolation' }, previous(140))).toBe('reps-first');
  expect(resolveProgressionMode({ ...squat, mechanic: null }, previous(140))).toBe('reps-first');
});
test('missing/zero/negative history and warm-ups cannot select load first', () => {
  for (const history of [[], previous(0), previous(-5), [{ kind: 'warmup', weightKilograms: 140 } as const]]) {
    expect(resolveProgressionMode(squat, history)).toBe('reps-first');
  }
});
test('the active entry unit chooses the load ladder', () => {
  const exercise = { ...squat, loadStepKilograms: null };
  expect(resolveProgressionMode(exercise, previous(95))).toBe('reps-first');
  expect(resolveProgressionMode(exercise, previous(95), {}, 'lb')).toBe('weight-first');
  expect(resolveProgressionMode({ ...exercise, defaultEntryUnit: 'lb' }, previous(toKilograms(225, 'lb')))).toBe(
    'weight-first',
  );
});
test('legacy double resolves to reps first; explicit modes override it', () => {
  expect(resolveProgressionMode(squat, previous(140), { progression: 'double', progressionMode: null })).toBe(
    'reps-first',
  );
  expect(resolveProgressionMode(squat, previous(140), { progression: 'double', progressionMode: 'weight-first' })).toBe(
    'weight-first',
  );
  expect(resolveProgressionMode(squat, previous(140), { progressionMode: 'reps-first' })).toBe('reps-first');
  expect(resolveProgressionMode(squat, previous(140), { progression: 'double', progressionMode: 'off' })).toBe('off');
});
test.each(['bodyweight-reps', 'duration', 'weight-duration'] as const)(
  '%s cannot resolve to load first',
  (tracking) => {
    expect(resolveProgressionMode({ ...squat, tracking }, previous(140), { progressionMode: 'weight-first' })).toBe(
      'reps-first',
    );
    expect(resolveProgressionMode({ ...squat, tracking }, previous(140), { progressionMode: 'off' })).toBe('off');
  },
);
