import { useEffect } from 'react';
import type { ExerciseSearchEntry } from '../../../core/library/ExerciseSearch';
import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import { BackLink } from '../../design/components/BackLink';
import { Button } from '../../design/components/Button';
import { Screen } from '../../design/components/Screen';
import { exerciseNamesById } from './exerciseNames';
import type { FolderChoice } from './FolderChoice';
import { TemplateExercisePicker } from './TemplateExercisePicker';
import { TemplateForm } from './TemplateForm';
import { useTemplateEditor } from './useTemplateEditor';
import { useTemplateTracking } from './useTemplateTracking';
import { ConfirmDialog } from '../../design/components/ConfirmDialog';
import { EmptyState } from '../../design/components/EmptyState';
import { useDiscardNavigation } from './useDiscardNavigation';
import styles from './TemplateEditor.module.css';
import { clearStashedTemplateDraft } from './templateDraftStash';

/**
 * Creates or edits a template from `initial`. The draft stays here until Save; "Add exercise" swaps
 * the form for the exercise picker and back, so nothing typed is lost.
 */
export function TemplateEditor({
  initial,
  entries,
  folders,
  returnPlanId,
  restored,
}: {
  /** The unsaved draft to continue from, when returning from an exercise page. */
  readonly restored?: TemplateDraft | undefined;
  readonly initial: TemplateDraft;
  readonly returnPlanId: number | null;
  readonly entries: readonly ExerciseSearchEntry[];
  readonly folders: readonly FolderChoice[];
}) {
  const model = useTemplateEditor(initial, returnPlanId, restored);
  // The stash has done its job once the editor holds the draft; a later fresh visit starts from what is saved.
  useEffect(() => {
    clearStashedTemplateDraft();
  }, []);
  const tracking = useTemplateTracking(model.draft.exercises);
  const navigation = useDiscardNavigation(initial, model.draft);
  const dialog = navigation.pending ? (
    <ConfirmDialog
      title="Discard changes?"
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={navigation.discard}
      onCancel={navigation.keepEditing}
    />
  ) : null;
  if (model.isPicking)
    return (
      <>
        <TemplateExercisePicker model={model} entries={entries} />
        {dialog}
      </>
    );
  return (
    <Screen
      title={initial.id === undefined ? 'New workout' : 'Edit workout'}
      leading={<BackLink to="/" label="Workout" />}
      trailing={
        <div className={styles.save}>
          <Button variant="primary" isDisabled={model.isSaving} onPress={model.save}>
            Save
          </Button>
        </div>
      }
    >
      {tracking.status === 'failed' ? (
        <EmptyState message={tracking.message} />
      ) : (
        <TemplateForm
          model={model}
          names={exerciseNamesById(entries)}
          equipment={new Map(entries.map((entry) => [entry.id, entry.equipment]))}
          folders={folders}
          tracking={tracking.status === 'ready' ? tracking.value : new Map()}
        />
      )}
      {dialog}
    </Screen>
  );
}
