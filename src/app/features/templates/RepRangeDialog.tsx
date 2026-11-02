import { useState } from 'react';
import { WorkoutLoggerLimits } from '../../../core/logging/WorkoutLogger';
import { RestTimerDefaults } from '../../../core/logging/RestTimer';
import type { TemplateSetDraft } from '../../../core/templates/TemplateDraft';
import { BottomSheet } from '../../design/components/BottomSheet';
import { Button } from '../../design/components/Button';
import { TargetRangeRow } from './TargetRangeRow';
import { parseRestDuration } from '../../format/parseRestDuration';

/** Targets applied to non-warm-up sets and the exercise-wide rest timer. */
export type RepRange = Pick<TemplateSetDraft, 'targetRepsLow' | 'targetRepsHigh' | 'targetRpe' | 'targetRpeHigh'> & {
  readonly restRange: { readonly low: number | null; readonly high: number | null };
};

/** Edits shared reps, effort and rest targets. */
export function RepRangeDialog({
  target,
  restLow,
  restHigh,
  workoutName,
  onSave,
  onCancel,
}: {
  readonly target: TemplateSetDraft | undefined;
  readonly restLow?: number | null;
  readonly restHigh?: number | null;
  readonly workoutName?: string;
  readonly onSave: (range: RepRange) => void;
  readonly onCancel: () => void;
}) {
  const [low, setLow] = useState(target?.targetRepsLow?.toString() ?? '');
  const [high, setHigh] = useState(target?.targetRepsHigh?.toString() ?? '');
  const [rpe, setRpe] = useState(target?.targetRpe?.toString() ?? '');
  const [rpeHigh, setRpeHigh] = useState(target?.targetRpeHigh?.toString() ?? '');
  const [rest, setRest] = useState(restLow === null || restLow === undefined ? '' : String(restLow));
  const [restUpper, setRestUpper] = useState(restHigh === null || restHigh === undefined ? '' : String(restHigh));
  const [error, setError] = useState('');
  return (
    <BottomSheet title="Targets" onClose={onCancel}>
      {workoutName !== undefined && <p>Saves to {workoutName}</p>}
      <TargetRangeRow
        label="Reps"
        low={low}
        high={high}
        onLow={setLow}
        onHigh={setHigh}
        placeholder={['6', '10']}
        inputMode="numeric"
      />
      <TargetRangeRow
        label="RPE"
        low={rpe}
        high={rpeHigh}
        onLow={setRpe}
        onHigh={setRpeHigh}
        placeholder={['8', '9']}
        inputMode="decimal"
      />
      <TargetRangeRow
        label="Rest"
        low={rest}
        high={restUpper}
        onLow={setRest}
        onHigh={setRestUpper}
        placeholder={['120', '180']}
        inputMode="text"
      />
      <p>Rest takes seconds (120), a unit (90s, 3m) or m:ss.</p>
      {error && <p role="alert">{error}</p>}
      <Button
        variant="primary"
        onPress={() => {
          const lower = Number(low);
          const upper = Number(high);
          const effort = rpe.trim() === '' ? null : Number(rpe);
          const effortHigh = rpeHigh.trim() === '' ? null : Number(rpeHigh);
          const restSeconds = parseRestDuration(rest);
          const restHighSeconds = parseRestDuration(restUpper);
          const validEffort = (value: number) =>
            Number.isFinite(value) && value >= 1 && value <= 10 && (value * 2) % 1 === 0;
          const validRest = (value: number) =>
            Number.isInteger(value) &&
            value >= RestTimerDefaults.minimumSeconds &&
            value <= RestTimerDefaults.maximumSeconds &&
            value % RestTimerDefaults.stepSeconds === 0;
          if (
            !Number.isInteger(lower) ||
            !Number.isInteger(upper) ||
            lower < 1 ||
            upper < lower ||
            upper > WorkoutLoggerLimits.maximumReps ||
            (effort !== null && !validEffort(effort)) ||
            (effortHigh !== null && (!validEffort(effortHigh) || effort === null || effortHigh < effort)) ||
            (restSeconds !== null && !validRest(restSeconds)) ||
            (restHighSeconds !== null &&
              (!validRest(restHighSeconds) || restSeconds === null || restHighSeconds < restSeconds))
          ) {
            setError(
              'Enter a valid rep range, RPE in half steps, and rest in 15-second steps, such as 120, 90s or 3m.',
            );
            return;
          }
          onSave({
            targetRepsLow: lower,
            targetRepsHigh: upper,
            targetRpe: effort,
            targetRpeHigh: effortHigh === effort ? null : effortHigh,
            restRange: { low: restSeconds, high: restHighSeconds === restSeconds ? null : restHighSeconds },
          });
        }}
      >
        Save
      </Button>
      <Button onPress={onCancel}>Cancel</Button>
    </BottomSheet>
  );
}
