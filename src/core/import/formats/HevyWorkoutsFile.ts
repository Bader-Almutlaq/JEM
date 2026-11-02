import type { StrongRow } from '../StrongRow';
import { parseWorkoutTimestamp } from './parseWorkoutTimestamp';
import { WorkoutFileTable } from './WorkoutFileTable';
import { WorkoutFileUnits } from './WorkoutFileUnits';

/** Hevy's documented set labels, translated to the existing review pipeline's set orders. */
const SetOrders: Readonly<Record<string, string>> = Object.freeze({
  normal: '1',
  warmup: 'W',
  dropset: 'D',
  failure: 'F',
});

/**
 * Adapts Hevy CSV to normalized rows with explicit kg/lb units. Start time keys workouts;
 * description is a workout note and exercise_notes becomes one separate note row per distinct
 * note within an exercise/workout. Optional end_time supplies elapsed session seconds.
 * Throws ImportError for missing identity columns or malformed values.
 */
export function parseHevyWorkoutsFile(text: string): StrongRow[] {
  const file = new WorkoutFileTable(text, ['title', 'start_time', 'exercise_title']);
  const rows: StrongRow[] = [];
  const seenNotes = new Set<string>();
  const readWeight = file.weightReader({ kilograms: ['weight_kg'], pounds: ['weight_lbs'] });
  file.table.rows.forEach((fields, index) => {
    const line = index + 2;
    const rawStart = file.requiredField(fields, line, 'start_time');
    const startedAt = parseWorkoutTimestamp(rawStart);
    if (startedAt === undefined) throw file.invalid('start_time', rawStart, line);
    const rawEnd = file.field(fields, 'end_time');
    const endedAt = rawEnd === '' ? undefined : parseWorkoutTimestamp(rawEnd);
    if (rawEnd !== '' && (endedAt === undefined || endedAt < startedAt)) throw file.invalid('end_time', rawEnd, line);
    const weight = readWeight(fields, line);
    const kilometers = file.number(fields, line, 'distance_km');
    const miles = kilometers === null ? file.number(fields, line, 'distance_miles') : null;
    const setType = file.field(fields, 'set_type').toLowerCase();
    const row: StrongRow = {
      line,
      sourceFormat: 'hevy',
      exportUnit: weight.unit,
      workoutKey: rawStart,
      startedAt,
      workoutName: file.field(fields, 'title'),
      durationSeconds:
        endedAt === undefined
          ? null
          : (Date.parse(endedAt) - Date.parse(startedAt)) / WorkoutFileUnits.millisecondsPerSecond,
      exerciseName: file.requiredField(fields, line, 'exercise_title'),
      content: { kind: 'set', order: SetOrders[setType] ?? '1' },
      weightValue: weight.value,
      reps: Math.round(file.number(fields, line, 'reps') ?? 0),
      rpe: file.number(fields, line, 'rpe'),
      distanceMeters:
        kilometers !== null
          ? kilometers * WorkoutFileUnits.metersPerKilometer
          : miles === null
            ? null
            : miles * WorkoutFileUnits.metersPerMile,
      seconds: file.number(fields, line, 'duration_seconds'),
      notes: null,
      workoutNotes: file.field(fields, 'description') || null,
    };
    const note = file.field(fields, 'exercise_notes');
    const noteKey = JSON.stringify([row.workoutKey, row.exerciseName, note]);
    if (note !== '' && !seenNotes.has(noteKey)) {
      // Note rows do not enter setsByLine; sharing the original line preserves set review IDs.
      rows.push({ ...row, content: { kind: 'note' }, notes: note });
      seenNotes.add(noteKey);
    }
    rows.push(row);
  });
  return rows;
}
