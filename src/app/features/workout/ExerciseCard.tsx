import { MachineBrandSheet } from './MachineBrandSheet';
import { DeloadChip } from './DeloadChip';
import { DeloadSheet } from './DeloadSheet';
import { useState } from 'react';
import { ExerciseInfoLine } from './ExerciseInfoLine';
import { WorkoutTextField } from './WorkoutTextField';
import { database, useDatabaseQuery } from '../../data/database';
import { Plus } from 'lucide-react';
import { matchPreviousSets } from '../../../core/queries/PreviousPerformance';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { setLabels } from '../../format/setText';
import type { EditedCell } from './CellEditor';
import styles from './ExerciseCard.module.css';
import { ExerciseCardHeader } from './ExerciseCardHeader';
import type { ExerciseCardActions } from './ExerciseCardActions';
import { SetColumnHeader } from './SetColumnHeader';
import { SetRow } from './SetRow';

/** One exercise in the workout being logged: its name, metadata, column titles, set rows and "Add set". */
export function ExerciseCard({
  entry,
  index,
  count,
  editing,
  actions,
  notes,
}: {
  readonly entry: LiveWorkoutEntry;
  readonly index: number;
  readonly count: number;
  /** The cell being edited, if it is in this exercise. */
  readonly editing: EditedCell | undefined;
  readonly actions: ExerciseCardActions;
  /** History supplies note writers and keeps its separate effort column. */
  readonly notes?: {
    readonly exercise: (notes: string) => void;
    readonly set: (setId: number, notes: string) => void;
  };
}) {
  const [dialog, setDialog] = useState<'machine' | 'deload' | undefined>(undefined);
  // Targets, rest time and notes are set when editing the saved workout, not while logging it.
  const live =
    notes === undefined
      ? { editDeload: () => setDialog('deload'), editMachine: () => setDialog('machine') }
      : undefined;
  const suggestions = useDatabaseQuery(`warmup-suggestions-${entry.entry.id}`, () =>
    database.suggestedWarmupSetIds(entry.entry.id),
  );
  const suggestedIds = suggestions.status === 'ready' ? suggestions.value : [];
  const unit =
    notes === undefined
      ? entry.exercise.defaultEntryUnit
      : (entry.sets[0]?.entryUnit ?? entry.exercise.defaultEntryUnit);
  const labels = setLabels(entry.sets);
  const previousSets = matchPreviousSets(entry.sets, entry.previous);
  return (
    <section className={styles.card} aria-label={entry.exercise.name}>
      <ExerciseCardHeader entry={entry} index={index} count={count} actions={actions} unit={unit} live={live} />
      {notes === undefined ? (
        <ExerciseInfoLine
          entry={entry}
          onMachine={() => setDialog('machine')}
          onDeload={actions.setDeload === undefined ? undefined : () => setDialog('deload')}
        />
      ) : (entry.entry.deloadStage ?? null) !== null ? (
        <DeloadChip entry={entry} />
      ) : null}
      {suggestions.status === 'failed' && (
        <p className={styles.error} role="alert">
          {suggestions.message}
        </p>
      )}
      {notes !== undefined && (
        <WorkoutTextField isMultiline label="Exercise notes" value={entry.entry.notes ?? ''} onSave={notes.exercise} />
      )}
      <SetColumnHeader tracking={entry.exercise.tracking} unit={unit} isPastWorkout={notes !== undefined} />
      {entry.sets.map((set, position) => (
        <SetRow
          key={set.id}
          entry={entry}
          set={set}
          label={labels[position] ?? ''}
          isSuggested={suggestedIds.includes(set.id)}
          displayUnit={unit}
          separatesWarmups={set.kind !== 'warmup' && entry.sets[position - 1]?.kind === 'warmup'}
          previous={previousSets[position]}
          editing={editing?.set.id === set.id ? editing : undefined}
          actions={actions}
          {...(notes === undefined
            ? {}
            : { onNotesChange: (value: string) => notes.set(set.id, value), isPastWorkout: true })}
        />
      ))}
      <div className={styles.addButtons}>
        <button type="button" className={styles.addSet} onClick={() => actions.addSet(entry.entry.id)}>
          <Plus size={16} strokeWidth={2} aria-hidden />
          <span>Add set</span>
        </button>
      </div>
      {dialog === 'deload' && (
        <DeloadSheet
          entry={entry}
          onClose={() => setDialog(undefined)}
          onSave={(settings, target) => {
            actions.setDeload?.(entry.entry.id, entry.entry.deloadStage ?? 1, settings, target);
            setDialog(undefined);
          }}
          onEnd={() => {
            actions.setDeload?.(entry.entry.id, null);
            setDialog(undefined);
          }}
        />
      )}
      {dialog === 'machine' && (
        <MachineBrandSheet
          value={entry.entry.machineBrand ?? null}
          onClose={() => setDialog(undefined)}
          onSave={(brand) => {
            actions.setMachineBrand?.(entry.entry.id, brand);
            setDialog(undefined);
          }}
        />
      )}
    </section>
  );
}
