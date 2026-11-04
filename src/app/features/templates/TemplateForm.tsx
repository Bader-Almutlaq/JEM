import type { Equipment } from '../../../core/library/Equipment';
import type { ExerciseTracking } from '../../../core/library/ExerciseTracking';
import { isTimedExercise } from './isTimedExercise';
import { Plus } from 'lucide-react';
import { Button } from '../../design/components/Button';
import { ErrorBanner } from '../../design/components/ErrorBanner';
import { NumberPad } from '../workout/NumberPad';
import type { FolderChoice } from './FolderChoice';
import { targetPadTitle } from './targetPadText';
import { TemplateDetailsSection } from './TemplateDetailsSection';
import type { TemplateEditorModel } from './TemplateEditorModel';
import { TemplateExerciseList } from './TemplateExerciseList';
import { TemplateSummaryStats } from './TemplateSummaryStats';
import { templateStats } from '../../../core/templates/TemplateStats';

/**
 * The template editor's form: details, totals, the exercise cards, "Add exercise", and the number pad
 * while a target is typed. Save sits in the screen header; the store's own message appears at the top of the
 * form when the template isn't acceptable.
 */
export function TemplateForm({
  model,
  names,
  equipment,
  folders,
  tracking,
}: {
  readonly model: TemplateEditorModel;
  readonly names: ReadonlyMap<number, string>;
  readonly equipment: ReadonlyMap<number, Equipment | null>;
  readonly folders: readonly FolderChoice[];
  readonly tracking: ReadonlyMap<number, ExerciseTracking>;
}) {
  const { pad } = model;
  return (
    <>
      {model.error !== undefined && <ErrorBanner message={model.error} onDismiss={model.dismissError} />}
      <TemplateDetailsSection model={model} folders={folders} />
      <TemplateSummaryStats stats={templateStats(model.draft)} />
      <TemplateExerciseList model={model} names={names} equipment={equipment} tracking={tracking} />
      <Button onPress={model.startPicking}>
        <Plus size={16} strokeWidth={2} aria-hidden />
        Add exercise
      </Button>
      {pad.editing !== undefined && (
        <NumberPad
          title={targetPadTitle(
            pad.editing.cell.field,
            isTimedExercise(tracking.get(model.draft.exercises[pad.editing.cell.exerciseIndex]?.exerciseId ?? -1)),
          )}
          allowsDecimal={pad.editing.cell.field === 'rpe'}
          unit={undefined}
          errorMessage={undefined}
          onDismissError={() => undefined}
          onKey={pad.press}
          onStep={pad.step}
          onNext={pad.next}
          onDone={pad.close}
          onUnitChange={() => undefined}
        />
      )}
    </>
  );
}
