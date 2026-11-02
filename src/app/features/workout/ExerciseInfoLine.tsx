import { DeloadChip } from './DeloadChip';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { progressionText } from './progressionText';
import { clockText } from '../../format/clockText';
import styles from './ExerciseCard.module.css';

/** Only existing metadata appears; unset rest and notes leave no blank line. */
export function ExerciseInfoLine({
  entry,
  onDeload,
  onMachine,
  onNote,
}: {
  readonly entry: LiveWorkoutEntry;
  readonly onMachine?: () => void;
  readonly onNote?: () => void;
  readonly onDeload?: (() => void) | undefined;
}) {
  const rest = entry.exercise.restTargetSeconds;
  const note = entry.entry.notes;
  const progression = progressionText(entry);
  const target = entry.plannedTargets?.find((set) => set.kind === 'working');
  const low = target?.targetRepsLow ?? null;
  const high = target?.targetRepsHigh ?? null;
  const reps = low === null ? high : high === null || low === high ? low : `${low}–${high}`;
  const range = reps === null ? undefined : `${reps} reps`;
  const effort =
    target?.targetRpe === null || target?.targetRpe === undefined
      ? undefined
      : `RPE ${target.targetRpe}${target.targetRpeHigh !== null && target.targetRpeHigh !== undefined && target.targetRpeHigh !== target.targetRpe ? `–${target.targetRpeHigh}` : ''}`;
  const restHigh = entry.exercise.restMaxSeconds;
  const restText =
    rest === null
      ? undefined
      : `Rest ${clockText(rest)}${restHigh !== null && restHigh !== undefined && restHigh !== rest ? `–${clockText(restHigh)}` : ''}`;
  if (
    range === undefined &&
    rest === null &&
    effort === undefined &&
    !note &&
    progression === undefined &&
    (entry.entry.deloadStage ?? null) === null &&
    !entry.entry.machineBrand &&
    !entry.previousOtherMachine
  )
    return null;
  return (
    <>
      {(range !== undefined ||
        effort !== undefined ||
        rest !== null ||
        progression !== undefined ||
        (entry.entry.deloadStage ?? null) !== null ||
        entry.entry.machineBrand ||
        entry.previousOtherMachine) && (
        <div className={styles.info}>
          {range !== undefined && <span className={styles.targets}>{range}</span>}
          {effort !== undefined && <span className={styles.targets}>{effort}</span>}
          {restText !== undefined && <span className={styles.targets}>{restText}</span>}
          {(entry.entry.deloadStage ?? null) === null && progression !== undefined && <span>{progression}</span>}
          {entry.entry.machineBrand && (
            <button type="button" onClick={onMachine}>
              {entry.entry.machineBrand}
            </button>
          )}
          {entry.previousOtherMachine && <span>Previous: other machine</span>}
          {(entry.entry.deloadStage ?? null) !== null && (
            <span className={styles.deload}>
              <DeloadChip entry={entry} onOpen={onDeload} />
            </span>
          )}
        </div>
      )}
      {note && (
        <button type="button" className={styles.note} onClick={onNote}>
          {note}
        </button>
      )}
    </>
  );
}
