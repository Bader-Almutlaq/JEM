import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import { log } from '../../../core/support/log';
import { database, messageOf } from '../../data/database';
import {
  withExerciseMoved,
  withExerciseMovedTo,
  withExerciseRemoved,
  withExercisesAdded,
  withSupersetToggled,
} from './templateExerciseEdits';
import type { TemplateEditorActions } from './TemplateEditorActions';
import type { TemplateEditorModel } from './TemplateEditorModel';
import { withKindCycled, withSetAdded, withSetRemoved } from './templateSetEdits';
import { withProgression } from './templateProgressionEdits';
import { useTargetPad } from './useTargetPad';
import { planPath } from './templatePaths';
import { backState } from '../../navigation/backState';
import { TemplateDraftState } from './TemplateDraftState';

/** Where the owner lands after saving: the Workout tab, where the template now appears. */
const AFTER_SAVE_PATH = '/';

/**
 * State and actions behind the template editor. The draft lives here until Save; the template
 * store checks it then, and its message is shown if it isn't acceptable. Anything that changes the
 * list of exercises or sets closes the number pad first, because the pad points at a position.
 */
export function useTemplateEditor(
  initial: TemplateDraft,
  returnPlanId: number | null,
  restored?: TemplateDraft,
): TemplateEditorModel {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<TemplateDraft>(restored ?? initial);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const pad = useTargetPad(draft, setDraft);

  const restructure = (change: (current: TemplateDraft) => TemplateDraft) => {
    pad.close();
    // Folded into the latest draft, so several quick changes (a drag crossing cards) all apply.
    setDraft((current) => change(current));
  };

  const actions: TemplateEditorActions = {
    edit: pad.begin,
    setRepRange: (index, range) =>
      restructure((current) => ({
        ...current,
        exercises: current.exercises.map((exercise, position) =>
          position !== index
            ? exercise
            : {
                ...exercise,
                restRange: range.restRange,
                sets: exercise.sets.map((set) =>
                  set.kind === 'warmup'
                    ? set
                    : {
                        ...set,
                        targetRepsLow: range.targetRepsLow,
                        targetRepsHigh: range.targetRepsHigh,
                        targetRpe: range.targetRpe,
                        targetRpeHigh: range.targetRpeHigh ?? null,
                      },
                ),
              },
        ),
      })),
    setExerciseNotes: (index, notes) =>
      restructure((current) => ({
        ...current,
        exercises: current.exercises.map((exercise, position) =>
          position === index ? { ...exercise, notes: notes === '' ? null : notes } : exercise,
        ),
      })),
    setMachineBrand: (index, brand) =>
      restructure((current) => ({
        ...current,
        exercises: current.exercises.map((exercise, position) =>
          position === index ? { ...exercise, machineBrand: brand } : exercise,
        ),
      })),
    setProgression: (index, mode) => restructure((current) => withProgression(current, index, mode)),
    addSet: (exerciseIndex, kind) => restructure((current) => withSetAdded(current, exerciseIndex, kind)),
    removeSet: (exerciseIndex, setIndex) => restructure((current) => withSetRemoved(current, exerciseIndex, setIndex)),
    cycleKind: (exerciseIndex, setIndex) => restructure((current) => withKindCycled(current, exerciseIndex, setIndex)),
    move: (exerciseIndex, direction) => restructure((current) => withExerciseMoved(current, exerciseIndex, direction)),
    moveTo: (exerciseIndex, targetIndex) =>
      restructure((current) => withExerciseMovedTo(current, exerciseIndex, targetIndex)),
    openExercise: (exerciseId) => {
      pad.close();
      // The draft goes into this editor's own history entry (for a swipe back or a reload) and rides along with
      // the exercise page's back link, so either way back finds it.
      const kept = TemplateDraftState.with(
        location.state,
        initial.id === undefined ? 'new' : String(initial.id),
        draft,
      );
      navigate(location, { replace: true, state: kept });
      navigate(`/exercises/${exerciseId}`, {
        state: backState(location, initial.id === undefined ? 'New workout' : 'Edit workout', kept),
      });
    },
    toggleSuperset: (exerciseIndex) => restructure((current) => withSupersetToggled(current, exerciseIndex)),
    removeExercise: (exerciseIndex) => restructure((current) => withExerciseRemoved(current, exerciseIndex)),
  };

  const save = () => {
    pad.close();
    setIsSaving(true);
    setError(undefined);
    database.saveTemplate(draft).then(
      () => navigate(returnPlanId === null ? AFTER_SAVE_PATH : planPath(returnPlanId), { replace: true }),
      (failure: unknown) => {
        log.ui.error('Saving a template failed', failure);
        setError(messageOf(failure));
        setIsSaving(false);
      },
    );
  };

  return {
    draft,
    pad,
    actions,
    error,
    isSaving,
    isPicking,
    setName: (name) => setDraft({ ...draft, name }),
    setFolder: (folderId) => setDraft({ ...draft, folderId }),
    setWeekday: (weekday) => setDraft({ ...draft, weekday }),
    setNotes: (notes) => setDraft({ ...draft, notes: notes === '' ? null : notes }),
    startPicking: () => {
      pad.close();
      setIsPicking(true);
    },
    stopPicking: () => setIsPicking(false),
    addPicked: (exerciseIds) => {
      setDraft(withExercisesAdded(draft, exerciseIds));
      setIsPicking(false);
    },
    dismissError: () => setError(undefined),
    save,
  };
}
