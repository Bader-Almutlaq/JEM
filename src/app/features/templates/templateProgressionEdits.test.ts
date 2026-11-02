import { expect, test } from 'vitest';
import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import type { ProgressionMode } from '../../../core/logging/ProgressionMode';
import { withProgression } from './templateProgressionEdits';

const draft: TemplateDraft = {
  name: 'Synthetic',
  folderId: null,
  notes: null,
  exercises: [
    {
      exerciseId: 1,
      supersetGroup: null,
      notes: null,
      progression: 'double',
      sets: [
        { kind: 'working', targetRepsLow: null, targetRepsHigh: null, targetRpe: 8 },
        { kind: 'working', targetRepsLow: 4, targetRepsHigh: 6, targetRpe: 9 },
        { kind: 'warmup', targetRepsLow: null, targetRepsHigh: null, targetRpe: null },
      ],
    },
  ],
};
const modes: readonly (ProgressionMode | null)[] = ['reps-first', 'weight-first', 'off', null];
test.each(modes)('choosing %s never re-enters ranges, changes other exercises or mutates the original', (mode) => {
  const original = { ...draft, exercises: [...draft.exercises, ...draft.exercises] };
  const result = withProgression(original, 0, mode);
  expect(result.exercises[0]).toMatchObject({
    progression: null,
    progressionMode: mode,
    sets: draft.exercises[0]?.sets,
  });
  expect(result.exercises[1]).toEqual(original.exercises[1]);
  expect(original.exercises[0]?.progression).toBe('double');
});
