import { isSameCell, type Cell } from './Cell';
import { startDraft, type NumberDraft } from './numberDraft';

/** The cell being edited and the draft typed into it; no draft until the first key, so the cell shows the saved value. */
export interface EditState {
  readonly cell: Cell;
  readonly typed: NumberDraft | undefined;
}

/**
 * The state after one change to the cell's draft, computed from the *latest* state rather than from
 * what was last drawn. Two taps landing before React redraws ("1" then "5") must both apply, giving
 * 15, so every key is folded into the previous state. A change meant for a cell the pad has already
 * left is dropped.
 *
 * @param savedText What the cell shows before the first key, used as the draft's starting point.
 */
export function applyDraftChange(
  previous: EditState | undefined,
  cell: Cell,
  savedText: string,
  change: (current: NumberDraft) => NumberDraft,
): EditState | undefined {
  if (previous === undefined || !isSameCell(previous.cell, cell)) return previous;
  return { cell, typed: change(previous.typed ?? startDraft(savedText)) };
}
