import { Plus } from 'lucide-react';
import type { LiveWorkoutSnapshot } from '../../../core/queries/LiveWorkout';
import { Button } from '../../design/components/Button';
import { Screen } from '../../design/components/Screen';
import styles from './ActiveWorkout.module.css';
import { ActiveWorkoutBar } from './ActiveWorkoutBar';
import { ExerciseCard } from './ExerciseCard';
import { LoggingErrorBanner } from './LoggingErrorBanner';
import { loggingQueue, useLoggingError } from './loggingQueue';
import { NumberPad } from './NumberPad';
import { padTitle } from './padTitle';
import { RenameWorkoutDialog } from './RenameWorkoutDialog';
import { WorkoutMenu } from './WorkoutMenu';
import { WorkoutMetadata } from './WorkoutMetadata';
import { TypoPromptDialog } from './TypoPromptDialog';
import { useActiveWorkout } from './useActiveWorkout';
import { WorkoutConfirmDialog } from './WorkoutConfirmDialog';
import { WorkoutTitle } from './WorkoutTitle';
import { recordsWeight } from './trackingKinds';

/**
 * The screen for the workout in progress: a bar with the clock and Finish, a card for each exercise,
 * "Add exercise", session metadata, and the number pad while a cell is edited.
 */
export function ActiveWorkout({ snapshot }: { readonly snapshot: LiveWorkoutSnapshot }) {
  const model = useActiveWorkout(snapshot);
  const loggingError = useLoggingError();
  const { workout, entries } = snapshot;
  const { editing } = model.editor;

  return (
    <Screen
      trailing={null}
      title={<WorkoutTitle name={workout.name} onPress={model.startRenaming} />}
      subtitle={<WorkoutMetadata startedAt={workout.startedAt} />}
      titleAccessory={
        <WorkoutMenu onRename={model.startRenaming} onDiscard={model.requestDiscard} onDeload={model.deloadWorkout} />
      }
      leading={<ActiveWorkoutBar startedAt={workout.startedAt} onFinish={model.requestFinish} />}
    >
      {editing === undefined && <LoggingErrorBanner />}
      <div className={styles.cards}>
        {entries.map((entry, index) => (
          <ExerciseCard
            key={entry.entry.id}
            entry={entry}
            index={index}
            count={entries.length}
            editing={editing?.entry.entry.id === entry.entry.id ? editing : undefined}
            actions={model.cardActions}
          />
        ))}
      </div>
      <Button onPress={model.openAddExercise}>
        <Plus size={16} strokeWidth={2} aria-hidden />
        Add exercise
      </Button>
      {editing !== undefined && (
        <NumberPad
          title={padTitle(editing.cell.field, editing.entry.exercise.tracking, editing.set.entryUnit, editing.text)}
          isRpe={editing.cell.field === 'rpe'}
          onRpe={() => model.editor.begin(editing.set.id, editing.cell.field === 'rpe' ? 'reps' : 'rpe')}
          onQuickRpe={model.editor.pick}
          allowsDecimal={editing.cell.field !== 'reps'}
          unit={
            editing.cell.field === 'weight' && recordsWeight(editing.entry.exercise.tracking)
              ? editing.set.entryUnit
              : undefined
          }
          errorMessage={loggingError}
          onDismissError={() => loggingQueue.dismissError()}
          onKey={model.editor.press}
          onStep={model.editor.step}
          onNext={model.editor.next}
          onDone={model.editor.close}
          onUnitChange={model.switchEditedUnit}
        />
      )}
      {model.isRenaming && (
        <RenameWorkoutDialog name={workout.name} onRename={model.rename} onCancel={model.cancelRenaming} />
      )}
      {model.confirmation !== undefined && (
        <WorkoutConfirmDialog
          confirmation={model.confirmation}
          onConfirm={model.confirm}
          onCancel={model.cancelConfirmation}
        />
      )}
      {model.typoPrompt !== undefined && (
        <TypoPromptDialog
          prompt={model.typoPrompt}
          onSaveAnyway={model.saveFlaggedSetAnyway}
          onFix={model.fixFlaggedSet}
        />
      )}
    </Screen>
  );
}
