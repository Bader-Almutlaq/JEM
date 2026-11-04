import { expect, test } from 'vitest';
import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import { TemplateDraftState } from './TemplateDraftState';

const draft: TemplateDraft = { name: 'Unsaved', folderId: null, notes: null, exercises: [] };

test('a kept draft comes back only to the editor it belongs to, and other state survives', () => {
  const state = TemplateDraftState.with({ back: { to: '/', label: 'Workout' } }, '12', draft);
  expect(TemplateDraftState.read(state, '12')).toEqual(draft);
  expect(TemplateDraftState.read(state, 'new')).toBeUndefined();
  expect(state['back']).toEqual({ to: '/', label: 'Workout' });
});

test('removing the draft keeps the rest, and state without one reads as nothing', () => {
  const state = TemplateDraftState.with({ from: '/plans/1' }, 'new', draft);
  const cleared = TemplateDraftState.without(state);
  expect(TemplateDraftState.read(cleared, 'new')).toBeUndefined();
  expect(cleared).toEqual({ from: '/plans/1' });
  expect(TemplateDraftState.read(null, 'new')).toBeUndefined();
  expect(TemplateDraftState.read({ templateDraft: 'junk' }, 'new')).toBeUndefined();
});
