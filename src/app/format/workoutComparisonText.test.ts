import { expect, test } from 'vitest';
import type { PersonalBest } from '../../core/queries/PersonalBests';
import type { WorkoutSet } from '../../core/models/WorkoutSet';
import {
  changeText,
  personalBestParts,
  personalBestText,
  topSetChangeText,
  volumeChangeText,
} from './workoutComparisonText';

test('formats descriptive signed changes and omits undefined percentages', () => {
  expect(volumeChangeText(8420, 7943)).toBe('7,943 kg → 8,420 kg (+6%)');
  expect(volumeChangeText(100, 0)).toBe('0 kg → 100 kg');
  expect(changeText(90, 100)).toBe(' (-10%)');
  expect(changeText(1, 0)).toBe('');
});

test('top-set changes read in the exercise unit', () => {
  const set = (weightKilograms: number, reps: number) => ({ weightKilograms, reps }) as WorkoutSet; // Only these fields are read.
  expect(topSetChangeText(set(100, 5), set(102.5, 5), 'kg')).toBe('100 × 5 → 102.5 × 5 kg');
});

test('a personal best has parts for a card and the same words as one plain line', () => {
  const best = {
    exercise: { name: 'Hammer Curl (Dumbbell)', defaultEntryUnit: 'kg' },
    kind: 'setVolume',
    value: 240,
    previous: 200,
    reps: null,
  } as PersonalBest; // Only the fields the formatter reads.
  expect(personalBestParts(best)).toEqual({
    label: 'Best set volume',
    exercise: 'Hammer Curl (Dumbbell)',
    value: '240 kg',
    previous: 'was 200 kg',
  });
  expect(personalBestText(best)).toBe('Best set volume · Hammer Curl (Dumbbell) · 240 kg (was 200 kg)');
});
