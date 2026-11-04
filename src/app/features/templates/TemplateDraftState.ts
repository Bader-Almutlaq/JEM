import type { TemplateDraft } from '../../../core/templates/TemplateDraft';

/** Where in a history entry's router state the editor keeps its unsaved draft. */
const DRAFT_FIELD = 'templateDraft';

/** Plain object view of router state, which is `unknown` and may be anything another screen put there. */
function fields(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null ? { ...state } : {};
}

/**
 * The template editor's unsaved draft, kept in the router state of the editor's own history entry while the owner
 * looks at an exercise page. The browser keeps that state across a reload and a swipe back, and each entry has
 * its own, so two editors can never mix drafts. `key` is the template id, or `new`, so a draft only returns to
 * the editor it came from.
 */
export const TemplateDraftState = Object.freeze({
  /** `state` with the draft added (other fields kept). */
  with(state: unknown, key: string, draft: TemplateDraft): Record<string, unknown> {
    return { ...fields(state), [DRAFT_FIELD]: { key, draft } };
  },

  /** The draft kept for this editor, if any. */
  read(state: unknown, key: string): TemplateDraft | undefined {
    const kept = fields(state)[DRAFT_FIELD];
    if (typeof kept !== 'object' || kept === null || !('key' in kept) || !('draft' in kept)) return undefined;
    // Only `with` writes this field, always with a TemplateDraft, and history state is structured-cloned data.
    return kept.key === key ? (kept.draft as TemplateDraft) : undefined;
  },

  /** `state` without the draft, so a later visit to the same history entry starts from what is saved. */
  without(state: unknown): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fields(state)).filter(([field]) => field !== DRAFT_FIELD));
  },
});
