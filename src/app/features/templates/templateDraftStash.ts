import type { TemplateDraft } from '../../../core/templates/TemplateDraft';

/** The unsaved draft of the editor the owner stepped out of to look at an exercise, and which editor it belongs to. */
let stashed: { readonly key: string; readonly draft: TemplateDraft } | undefined;

/** Search parameter that tells an editor to pick its stashed draft back up on return. */
export const RESTORE_PARAMETER = 'restore';

/** Remembers an editor's unsaved draft while the owner looks at an exercise page. Replaces any earlier one. */
export function stashTemplateDraft(key: string, draft: TemplateDraft): void {
  stashed = { key, draft };
}

/** The stashed draft for this editor, if there is one. Pure, so repeated renders agree. */
export function peekStashedTemplateDraft(key: string): TemplateDraft | undefined {
  return stashed?.key === key ? stashed.draft : undefined;
}

/** Forgets the stash once the editor has picked it up, so a later fresh visit starts from what is saved. */
export function clearStashedTemplateDraft(): void {
  stashed = undefined;
}
