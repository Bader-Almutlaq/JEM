import { useRef, useState } from 'react';
import type { WorkoutDetail } from '../../../core/queries/WorkoutHistory';
import { database } from '../../data/database';
import { loggingQueue } from './loggingQueue';
import { useLocation, useNavigate } from 'react-router';
import { backState } from '../../navigation/backState';
import type { LiveWorkoutEntry, LiveWorkoutSnapshot } from '../../../core/queries/LiveWorkout';
import type { WeightUnit } from '../../../core/units/WeightUnit';
import type { ActiveWorkoutModel } from './ActiveWorkoutModel';
import type { Confirmation } from './confirmation';
import type { ExerciseCardActions } from './ExerciseCardActions';
import { plannedSetCount } from './liveWorkoutLookup';
import { finishCheck } from './finishCheck';
import type { TypoPrompt } from './typoPrompt';
import { useCellEditor } from './useCellEditor';
import * as actions from './workoutActions';
import { ADD_EXERCISE_PATH, summaryPath } from './workoutPaths';

/**
 * State and actions behind the screen for the workout in progress. Every action is queued to the
 * database in tap order (`loggingQueue`) and the screen changes only when the new state arrives, so
 * what is shown is what is saved. Any half-typed cell is saved first, so a tap never loses a number.
 */
export function useActiveWorkout(snapshot: LiveWorkoutSnapshot): ActiveWorkoutModel {
  const navigate = useNavigate();
  const location = useLocation();
  const editor = useCellEditor(snapshot);
  const [confirmation, setConfirmation] = useState<Confirmation | undefined>(undefined);
  const [typoPrompt, setTypoPrompt] = useState<TypoPrompt | undefined>(undefined);
  const [isRenaming, setIsRenaming] = useState(false);
  const { workout, entries } = snapshot;

  const finish = (endedAt?: string) => {
    editor.close();
    void actions.finishWorkout(workout.id, endedAt).then((savedId) => {
      if (savedId !== undefined) navigate(summaryPath(savedId));
    });
  };

  const finishDetail = useRef<WorkoutDetail | undefined>(undefined);
  const [finishTime, setFinishTime] = useState<string | undefined>(undefined);
  const continueFinish = (stage: 'short' | 'idle' | 'planned', endedAt?: string) => {
    const detail = finishDetail.current;
    if (detail === undefined) return;
    const now = new Date();
    const completed = detail.entries.flatMap((entry) => entry.sets).filter((set) => set.isCompleted);
    const check = stage === 'planned' ? undefined : finishCheck(detail, now, stage);
    if (check === 'empty') {
      setConfirmation({ kind: 'empty' });
      return;
    }
    if (check === 'short') {
      const minutes = Math.floor((now.getTime() - new Date(detail.workout.startedAt).getTime()) / 60_000);
      setConfirmation({ kind: 'short', minutes });
      return;
    }
    const last = completed
      .map((set) => set.completedAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1);
    if (check === 'idle' && last !== undefined) {
      const time = new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      setConfirmation({ kind: 'leftRunning', time, endedAt: last });
      return;
    }
    setFinishTime(endedAt);
    const plannedSets = plannedSetCount(detail.entries);
    if (plannedSets > 0) setConfirmation({ kind: 'finish', plannedSets });
    else finish(endedAt);
  };

  const cardActions: ExerciseCardActions = {
    isValueEntered: editor.isValueEntered,
    applySuggestion: (setId, field, value) => editor.acceptSuggestion({ setId, field }, value),
    openExercise: (exerciseId) => {
      editor.close();
      navigate(`/exercises/${exerciseId}`, { state: backState(location, 'Workout') });
    },
    edit: editor.begin,
    toggleCompleted: (entry: LiveWorkoutEntry, set) => {
      editor.close();
      if (set.isCompleted) actions.clearSet(set.id);
      else actions.completeCheckedSet(workout.id, entry.exercise.id, set.id, setTypoPrompt);
    },
    selectKind: (setId, kind) => {
      editor.close();
      actions.setSetKind(workout.id, setId, kind);
    },
    deleteSet: (setId) => {
      editor.forget(setId);
      actions.deleteSet(setId);
    },
    addSet: (entryId, kind) => {
      editor.close();
      actions.addSet(entryId, kind);
    },
    setMachineBrand: (entryId, brand) => {
      editor.close();
      actions.setMachineBrand(entryId, brand);
    },
    setDeload: (entryId, stage, settings, targetSets) => {
      editor.close();
      actions.setDeload(entryId, stage, settings, targetSets);
    },
    switchUnit: (entryId, unit) => {
      editor.close();
      actions.switchUnit(entryId, unit);
    },
    move: (entryId, offset) => {
      const index = entries.findIndex((entry) => entry.entry.id === entryId);
      editor.close();
      actions.moveExercise(entryId, index + offset);
    },
    requestRemoval: (entry) => {
      editor.close();
      if (entry.sets.some((set) => set.isCompleted))
        setConfirmation({ kind: 'removeExercise', entryId: entry.entry.id, name: entry.exercise.name });
      else actions.removeExercise(entry.entry.id);
    },
  };

  return {
    snapshot,
    editor,
    cardActions,
    confirmation,
    typoPrompt,
    isRenaming,
    switchEditedUnit: (unit: WeightUnit) => {
      const editing = editor.editing;
      if (editing === undefined) return;
      editor.commit();
      actions.switchUnit(editing.entry.entry.id, unit);
      if (editing.set.entryUnit !== unit) actions.setSetUnit(workout.id, editing.set.id, unit);
    },
    openAddExercise: () => {
      editor.close();
      navigate(ADD_EXERCISE_PATH);
    },
    startRenaming: () => {
      editor.close();
      setIsRenaming(true);
    },
    rename: (name) => {
      setIsRenaming(false);
      const trimmed = name.trim();
      if (trimmed !== '') actions.renameWorkout(workout.id, trimmed, workout.notes);
    },
    cancelRenaming: () => setIsRenaming(false),
    deloadWorkout: (settings) => {
      editor.close();
      actions.deloadWorkout(workout.id, settings);
    },
    requestDiscard: () => {
      editor.close();
      setConfirmation({ kind: 'discard' });
    },
    requestFinish: () => {
      editor.close();
      void loggingQueue
        .enqueue(() => database.workoutDetail(workout.id))
        .then((detail) => {
          if (detail === undefined) return;
          finishDetail.current = detail;
          continueFinish('short');
        });
    },
    confirm: () => {
      const answered = confirmation;
      setConfirmation(undefined);
      if (answered === undefined) return;
      switch (answered.kind) {
        case 'discard':
        case 'empty':
          actions.discardWorkout(workout.id);
          break;
        case 'short':
          continueFinish('idle');
          break;
        case 'leftRunning':
          continueFinish('planned', answered.endedAt);
          break;
        case 'finish':
          finish(finishTime);
          break;
        case 'removeExercise':
          actions.removeExercise(answered.entryId);
          break;
      }
    },
    cancelConfirmation: () => {
      const answered = confirmation;
      setConfirmation(undefined);
      if (answered?.kind === 'short') actions.discardWorkout(workout.id);
      if (answered?.kind === 'leftRunning') continueFinish('planned');
    },
    saveFlaggedSetAnyway: () => {
      if (typoPrompt !== undefined) actions.completeSet(typoPrompt.setId);
      setTypoPrompt(undefined);
    },
    fixFlaggedSet: () => {
      if (typoPrompt !== undefined) editor.begin(typoPrompt.setId, typoPrompt.field);
      setTypoPrompt(undefined);
    },
  };
}
