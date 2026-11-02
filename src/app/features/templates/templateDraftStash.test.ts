import { afterEach, expect, test } from 'vitest';
import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import { clearStashedTemplateDraft, peekStashedTemplateDraft, stashTemplateDraft } from './templateDraftStash';

const draft: TemplateDraft = { name: 'Unsaved', folderId: null, notes: null, exercises: [] };

afterEach(() => clearStashedTemplateDraft());

test('a stashed draft comes back only to the editor it belongs to, until cleared', () => {
  stashTemplateDraft('12', draft);
  expect(peekStashedTemplateDraft('12')).toBe(draft);
  expect(peekStashedTemplateDraft('12')).toBe(draft);
  expect(peekStashedTemplateDraft('new')).toBeUndefined();
  clearStashedTemplateDraft();
  expect(peekStashedTemplateDraft('12')).toBeUndefined();
});

test('a later stash replaces the earlier one', () => {
  stashTemplateDraft('12', draft);
  stashTemplateDraft('new', { ...draft, name: 'Other' });
  expect(peekStashedTemplateDraft('12')).toBeUndefined();
  expect(peekStashedTemplateDraft('new')?.name).toBe('Other');
});
