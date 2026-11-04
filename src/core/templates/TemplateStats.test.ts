import { describe, expect, test } from 'vitest';
import type { TemplateDraft, TemplateSetDraft } from './TemplateDraft';
import { templateStats } from './TemplateStats';

function set(overrides: Partial<TemplateSetDraft> = {}): TemplateSetDraft {
  return { kind: 'working', targetRepsLow: 8, targetRepsHigh: 10, targetRpe: null, targetRpeHigh: null, ...overrides };
}

function draft(...sets: readonly (readonly TemplateSetDraft[])[]): TemplateDraft {
  return {
    name: 'Synthetic',
    folderId: null,
    weekday: null,
    notes: null,
    exercises: sets.map((exerciseSets, index) => ({
      exerciseId: index + 1,
      notes: null,
      supersetGroup: null,
      machineBrand: null,
      sets: exerciseSets,
    })),
    // Only the fields templateStats reads are filled in.
  } as TemplateDraft;
}

describe('templateStats', () => {
  test('an empty draft has nothing and no average effort', () => {
    expect(templateStats(draft())).toEqual({ exercises: 0, workingSets: 0, warmupSets: 0, averageRpe: null });
  });

  test('counts exercises, working sets and warm-ups separately', () => {
    const stats = templateStats(
      draft([set({ kind: 'warmup' }), set(), set({ kind: 'drop' })], [set(), set({ kind: 'failure' })]),
    );
    expect(stats).toMatchObject({ exercises: 2, workingSets: 4, warmupSets: 1 });
  });

  test('averages target RPE over working sets that have one, using range midpoints, ignoring warm-ups', () => {
    const stats = templateStats(
      draft([
        set({ kind: 'warmup', targetRpe: 3 }),
        set({ targetRpe: 8 }),
        set({ targetRpe: 8, targetRpeHigh: 9 }),
        set(),
      ]),
    );
    expect(stats.averageRpe).toBeCloseTo((8 + 8.5) / 2);
  });
});
