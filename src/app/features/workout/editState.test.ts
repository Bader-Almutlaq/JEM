import { describe, expect, test } from 'vitest';
import { applyDraftChange, type EditState } from './editState';
import { typeKey } from './numberDraft';
import { digitKey } from './PadKey';

const cell = { setId: 1, field: 'reps' } as const;
const start: EditState = { cell, typed: undefined };

describe('applyDraftChange', () => {
  test('Regression: two quick taps before a redraw both apply, so "1" then "5" gives 15', () => {
    // Both taps are folded into the state each one receives, as React's updater form does.
    const afterOne = applyDraftChange(start, cell, '8', (draft) => typeKey(draft, digitKey(1)));
    const afterFive = applyDraftChange(afterOne, cell, '8', (draft) => typeKey(draft, digitKey(5)));
    expect(afterFive?.typed?.text).toBe('15');
  });

  test('the first key replaces the saved value; later keys append', () => {
    const typed = [1, 4, 0].reduce<EditState | undefined>(
      (state, digit) => applyDraftChange(state, cell, '135', (draft) => typeKey(draft, digitKey(digit))),
      start,
    );
    expect(typed?.typed?.text).toBe('140');
  });

  test('a change for a cell the pad has left, or with the pad closed, is ignored', () => {
    const moved: EditState = { cell: { setId: 2, field: 'weight' }, typed: undefined };
    expect(applyDraftChange(moved, cell, '8', (draft) => typeKey(draft, digitKey(1)))).toBe(moved);
    expect(applyDraftChange(undefined, cell, '8', (draft) => typeKey(draft, digitKey(1)))).toBeUndefined();
  });
});
