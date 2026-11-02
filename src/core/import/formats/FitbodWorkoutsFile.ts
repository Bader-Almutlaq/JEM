import type { StrongRow } from '../StrongRow';
import { parseWorkoutTimestamp } from './parseWorkoutTimestamp';
import { WorkoutFileTable } from './WorkoutFileTable';

/**
 * Adapts Fitbod CSV to one workout per distinct start minute (date-only rows use noon).
 * Weights retain explicit kg/lb units; multiplier is deliberately ignored so dumbbell loads
 * stay as entered. Note is a set note, Duration(s) seconds, Distance(m) meters.
 * Throws ImportError for missing identity columns, malformed values or unrecognized warmup flags.
 */
export function parseFitbodWorkoutsFile(text: string): StrongRow[] {
  const file = new WorkoutFileTable(text, ['Date', 'Exercise']);
  const readWeight = file.weightReader({ kilograms: ['Weight(kg)'], pounds: ['Weight(lb)', 'Weight(lbs)'] });
  return file.table.rows.map((fields, index): StrongRow => {
    const line = index + 2;
    const date = file.requiredField(fields, line, 'Date');
    const timestamp = parseWorkoutTimestamp(date);
    if (timestamp === undefined) throw file.invalid('Date', date, line);
    // Heuristic: Fitbod supplies no workout ID; seconds within a start minute are one session.
    const startedAt = timestamp.replace(/:\d{2}\.\d{3}Z$/, ':00.000Z');
    const dateOnly = /^\d{4}-\d{1,2}-\d{1,2}$/.test(date);
    const weight = readWeight(fields, line);
    const warmup = file.field(fields, 'isWarmup').toLowerCase();
    if (!['', 'true', 'false', '1', '0', 'yes', 'no'].includes(warmup)) throw file.invalid('isWarmup', warmup, line);
    return {
      line,
      sourceFormat: 'fitbod',
      exportUnit: weight.unit,
      workoutKey: dateOnly
        ? date
            .split('-')
            .map((part) => part.padStart(2, '0'))
            .join('-')
        : startedAt,
      startedAt,
      workoutName: 'Fitbod workout',
      durationSeconds: null,
      exerciseName: file.requiredField(fields, line, 'Exercise'),
      content: { kind: 'set', order: ['true', '1', 'yes'].includes(warmup) ? 'W' : String(index + 1) },
      weightValue: weight.value,
      reps: Math.round(file.number(fields, line, 'Reps') ?? 0),
      rpe: null,
      distanceMeters: file.number(fields, line, 'Distance(m)'),
      seconds: file.number(fields, line, 'Duration(s)'),
      notes: file.field(fields, 'Note') || null,
      workoutNotes: null,
    };
  });
}
