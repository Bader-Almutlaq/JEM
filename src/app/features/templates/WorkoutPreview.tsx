import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import { WorkoutPreviewCard } from './WorkoutPreviewCard';

/** Loads the unstarted session only while the saved workout's Exercises tab is open. */
export function WorkoutPreview({ templateId }: { readonly templateId: number }) {
  const preview = useDatabaseQuery(`workout-preview-${templateId}`, () => database.previewWorkout(templateId));
  if (preview.status !== 'ready')
    return <EmptyState message={preview.status === 'failed' ? preview.message : 'Loading…'} />;
  if (preview.value.entries.length === 0)
    return <EmptyState message="No exercises yet. Edit this workout to add one." />;
  return preview.value.entries.map((entry) => (
    <WorkoutPreviewCard
      key={entry.entry.id}
      entry={entry}
      templateId={templateId}
      suggestedWarmupSetIds={preview.value.suggestedWarmupSetIds}
    />
  ));
}
