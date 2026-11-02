import type { TypoPrompt } from './typoPrompt';
import { useState } from 'react';
import type { LiveWorkoutSnapshot } from '../../../core/queries/LiveWorkout';
import { isSameCell, type Cell, type Field } from './Cell';
import type { CellEditor, EditedCell } from './CellEditor';
import { nextCell } from './cellOrder';
import { locateSet } from './liveWorkoutLookup';
import { applyDraftChange, type EditState } from './editState';
import { draftHasChanged, draftValue, startDraft, stepDraft, typeKey, type NumberDraft } from './numberDraft';
import { padRange } from './padRange';
import { cellStartText } from './setCellText';
import { saveCell } from './workoutActions';

/**
 * The number pad's state and local entered/accepted styling for the workout on screen. A value
 * is written when the owner moves to another cell or closes the pad,
 * not on every key. What the rows show always comes from the database. History supplies
 * `onSuspicious` to check edited weights and reps without changing completion.
 */
export function useCellEditor(snapshot: LiveWorkoutSnapshot, onSuspicious?: (prompt: TypoPrompt) => void): CellEditor {
  const [state, setState] = useState<EditState | undefined>(undefined);
  const [enteredCells, setEnteredCells] = useState<readonly Cell[]>([]);
  const location = state === undefined ? undefined : locateSet(snapshot.entries, state.cell.setId);
  const workoutId = snapshot.workout.id;

  let editing: EditedCell | undefined;
  let draft: NumberDraft | undefined;
  if (state !== undefined && location !== undefined) {
    const saved = cellStartText(location.set, state.cell.field, location.entry.exercise.tracking);
    draft = state.typed ?? startDraft(saved);
    editing = { cell: state.cell, entry: location.entry, set: location.set, text: draft.text };
  }

  const save = () => {
    if (editing === undefined || state?.typed === undefined || !draftHasChanged(state.typed)) return;
    saveCell(workoutId, editing.cell, draftValue(state.typed), editing.entry.exercise.tracking, onSuspicious);
    setEnteredCells((cells) => [...cells, editing.cell]);
  };

  // Folds each change into the latest state, so taps that land before a redraw are not lost.
  const edit = (change: (current: NumberDraft, edited: EditedCell) => NumberDraft) => {
    if (editing === undefined || draft === undefined) return;
    const edited = editing;
    const savedText = cellStartText(edited.set, edited.cell.field, edited.entry.exercise.tracking);
    setState((previous) => applyDraftChange(previous, edited.cell, savedText, (current) => change(current, edited)));
  };

  return {
    isValueEntered: (setId, field) =>
      enteredCells.some((cell) => cell.setId === setId && cell.field === field) ||
      (state?.cell.setId === setId &&
        state.cell.field === field &&
        state.typed !== undefined &&
        draftHasChanged(state.typed)),
    acceptSuggestion: (cell, value) => {
      save();
      setState(undefined);
      const target = locateSet(snapshot.entries, cell.setId);
      if (target === undefined) return;
      saveCell(workoutId, cell, value, target.entry.exercise.tracking, onSuspicious);
      setEnteredCells((cells) => [...cells, cell]);
    },
    editing,
    begin: (setId: number, field: Field) => {
      const cell: Cell = { setId, field };
      if (editing !== undefined && isSameCell(editing.cell, cell)) return;
      save();
      setState({ cell, typed: undefined });
    },
    press: (key) => edit((current) => typeKey(current, key)),
    pick: (value) => edit((current) => ({ ...current, text: String(value), replacesOnNextKey: false })),
    step: (direction) =>
      edit((current, edited) => {
        const range = padRange(edited.cell.field, edited.set.entryUnit);
        return stepDraft(current, direction * range.step, range.minimum, range.maximum);
      }),
    next: () => {
      if (editing === undefined) return;
      save();
      const target = nextCell(snapshot.entries, editing.cell);
      setState(target === undefined ? undefined : { cell: target, typed: undefined });
    },
    commit: () => {
      save();
      setState((current) => (current === undefined ? undefined : { cell: current.cell, typed: undefined }));
    },
    close: () => {
      save();
      setState(undefined);
    },
    forget: (setId) => setState((current) => (current?.cell.setId === setId ? undefined : current)),
  };
}
