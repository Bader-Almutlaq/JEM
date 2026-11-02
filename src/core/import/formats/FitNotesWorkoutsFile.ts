import type { StrongRow } from '../StrongRow';
import { parseWorkoutTimestamp } from './parseWorkoutTimestamp';
import { metersPerDistanceUnit } from './metersPerDistanceUnit';
import { WorkoutFileTable } from './WorkoutFileTable';
import { WorkoutFileUnits } from './WorkoutFileUnits';

/**
 * Adapts FitNotes CSV to working sets in one `FitNotes workout` per local date at noon.
 * Preserves row order, explicit weight units and Comment as the set note. Time is HH:MM:SS;
 * nonempty distance requires a recognized Distance Unit rather than guessing a scale.
 * Throws ImportError for missing identity columns or malformed values.
 */
export function parseFitNotesWorkoutsFile(text: string): StrongRow[] {
  const file = new WorkoutFileTable(text, ['Date', 'Exercise']);
  return file.table.rows.map((fields, index): StrongRow => {
    const line = index + 2;
    const date = file.requiredField(fields, line, 'Date');
    const startedAt = /^\d{4}-\d{1,2}-\d{1,2}$/.test(date) ? parseWorkoutTimestamp(date) : undefined;
    if (startedAt === undefined) throw file.invalid('Date', date, line);
    const weight = file.weight(fields, line, 'Weight (kgs)', 'Weight (lbs)');
    const rawTime = file.field(fields, 'Time');
    let seconds: number | null = null;
    if (rawTime !== '') {
      const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(rawTime);
      if (match === null) throw file.invalid('Time', rawTime, line);
      const [, hour = '0', minute = '0', second = '0'] = match;
      seconds =
        Number(hour) * WorkoutFileUnits.secondsPerHour +
        Number(minute) * WorkoutFileUnits.secondsPerMinute +
        Number(second);
      if (!Number.isFinite(seconds)) throw file.invalid('Time', rawTime, line);
    }
    const distance = file.number(fields, line, 'Distance');
    const distanceUnit = file.field(fields, 'Distance Unit').toLowerCase();
    let distanceMeters: number | null = null;
    if (distance !== null && distance !== 0) {
      const metersPerUnit = metersPerDistanceUnit(distanceUnit);
      if (metersPerUnit === undefined) throw file.invalid('Distance Unit', distanceUnit, line);
      distanceMeters = distance * metersPerUnit;
    }
    return {
      line,
      sourceFormat: 'fitnotes',
      exportUnit: weight.unit,
      workoutKey: date
        .split('-')
        .map((part) => part.padStart(2, '0'))
        .join('-'),
      startedAt,
      workoutName: 'FitNotes workout',
      durationSeconds: null,
      exerciseName: file.requiredField(fields, line, 'Exercise'),
      content: { kind: 'set', order: String(index + 1) },
      weightValue: weight.value,
      reps: Math.round(file.number(fields, line, 'Reps') ?? 0),
      rpe: null,
      distanceMeters,
      seconds,
      notes: file.field(fields, 'Comment') || null,
      workoutNotes: null,
    };
  });
}
