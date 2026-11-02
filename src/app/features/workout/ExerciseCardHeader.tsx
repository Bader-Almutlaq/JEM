import { progressionText } from './progressionText';
import { Link } from 'react-router';
import type { WeightUnit } from '../../../core/units/WeightUnit';
import { Ellipsis } from 'lucide-react';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { ActionMenu } from '../../design/components/ActionMenu';
import type { ExerciseCardActions } from './ExerciseCardActions';
import styles from './ExerciseCardHeader.module.css';
import { recordsWeight } from './trackingKinds';
import { UnitChip } from './UnitChip';
import { exerciseMenuItems } from './exerciseMenuItems';

/** Accent exercise link and capability-aware menu; history retains its unit chip and heading. */
export function ExerciseCardHeader({
  entry,
  index,
  count,
  actions,
  unit,
  live,
  readOnly = false,
  nameTo,
}: {
  readonly entry: LiveWorkoutEntry;
  readonly index: number;
  readonly count: number;
  readonly actions?: ExerciseCardActions;
  readonly readOnly?: boolean;
  /** Preview retains navigation to workout-specific exercise progress without logging actions. */
  readonly nameTo?: string;
  readonly unit?: WeightUnit;
  readonly live?: Parameters<typeof exerciseMenuItems>[0]['live'];
}) {
  const displayUnit = unit ?? entry.exercise.defaultEntryUnit;
  return (
    <div className={styles.header}>
      <h2 className={`${styles.name} ${readOnly ? styles.preview : ''}`}>
        {nameTo !== undefined ? (
          <Link to={nameTo}>{entry.exercise.name}</Link>
        ) : live === undefined ? (
          entry.exercise.name
        ) : (
          <button type="button" className={styles.link} onClick={() => actions?.openExercise?.(entry.exercise.id)}>
            {entry.exercise.name}
          </button>
        )}
      </h2>
      {!readOnly && actions !== undefined && live === undefined && recordsWeight(entry.exercise.tracking) && (
        <UnitChip unit={displayUnit} onSwitch={(unit) => actions.switchUnit(entry.entry.id, unit)} />
      )}
      {!readOnly && actions !== undefined && (
        <ActionMenu
          label="Exercise options"
          caption={live === undefined ? undefined : progressionText(entry)}
          items={exerciseMenuItems({ entry, index, count, actions, unit: displayUnit, live })}
        >
          <Ellipsis size={20} strokeWidth={2} aria-hidden />
        </ActionMenu>
      )}
    </div>
  );
}
