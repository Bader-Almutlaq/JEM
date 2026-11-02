import { useParams, useSearchParams } from 'react-router';
import { database, useDatabaseQuery } from '../../data/database';
import { BackLink } from '../../design/components/BackLink';
import { EmptyState } from '../../design/components/EmptyState';
import { Screen } from '../../design/components/Screen';
import { NEW_TEMPLATE_DRAFT } from './templateExerciseEdits';
import { peekStashedTemplateDraft, RESTORE_PARAMETER } from './templateDraftStash';
import { TemplateEditor } from './TemplateEditor';

const MISSING_MESSAGE = 'This workout no longer exists.';

/**
 * The route for creating (`/workout/templates/new`) or editing (`/workout/templates/ID`) a template.
 * It loads what the editor needs and shows the editor once it has arrived.
 */
export function TemplateEditorScreen() {
  const templateId = useParams().templateId;
  const [search] = useSearchParams();
  const planId = Number(search.get('plan'));
  const isNew = templateId === undefined;
  const title = isNew ? 'New workout' : 'Edit workout';
  const draft = useDatabaseQuery(`template-${templateId ?? 'new'}`, () =>
    isNew ? Promise.resolve(NEW_TEMPLATE_DRAFT) : database.templateDetail(Number(templateId)),
  );
  // Coming back from an exercise page the editor was left for, its unsaved draft is picked up again.
  const restored = search.get(RESTORE_PARAMETER) === '1' ? peekStashedTemplateDraft(templateId ?? 'new') : undefined;
  const entries = useDatabaseQuery('exercise-entries', () => database.exerciseEntries());
  const list = useDatabaseQuery('template-list', () => database.templateList());

  if (draft.status === 'ready' && entries.status === 'ready' && list.status === 'ready') {
    if (draft.value === null)
      return (
        <Screen title={title} leading={<BackLink to="/" label="Workout" />}>
          <EmptyState message={MISSING_MESSAGE} />
        </Screen>
      );
    return (
      <TemplateEditor
        key={templateId ?? 'new'}
        initial={
          isNew && list.value.folders.some((folder) => folder.id === planId)
            ? { ...draft.value, folderId: planId }
            : draft.value
        }
        restored={restored}
        returnPlanId={list.value.folders.some((folder) => folder.id === planId) ? planId : null}
        entries={entries.value}
        folders={list.value.folders}
      />
    );
  }
  const failure = [draft, entries, list].find((query) => query.status === 'failed');
  return (
    <Screen title={title} leading={<BackLink to="/" label="Workout" />}>
      <EmptyState message={failure?.status === 'failed' ? failure.message : 'Loading…'} />
    </Screen>
  );
}
