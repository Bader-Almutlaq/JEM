import { CsvTable } from './CsvTable';
import { ImportError } from './ImportError';
import { metersPerDistanceUnit } from './formats/metersPerDistanceUnit';
import { readWeightUnit } from './formats/readWeightUnit';
import { parseDecimal } from './parseDecimal';
import { readExportNumber } from './readExportNumber';
import type { StrongRow, StrongRowContent } from './StrongRow';
import { parseStrongTimestamp } from './StrongTimestamp';
import { trimWhitespace } from './trimWhitespace';

/** Seconds in the units of a Strong duration such as "1h 7m". */
const DurationUnitSeconds = {
  hour: 3600,
  minute: 60,
  second: 1,
} as const;

/** The `Set Order` values (compared case-insensitively) that mark a row as something other than a set. */
const NonSetOrder = {
  note: 'note',
  restTimer: 'rest timer',
} as const;

/** Column positions, resolved by header name so column order doesn't matter. */
interface Columns {
  readonly date: number;
  readonly workoutName: number;
  readonly exerciseName: number;
  readonly setOrder: number;
  readonly duration: number | undefined;
  readonly weight: number | undefined;
  readonly reps: number | undefined;
  readonly rpe: number | undefined;
  readonly distance: number | undefined;
  readonly seconds: number | undefined;
  readonly notes: number | undefined;
  readonly workoutNotes: number | undefined;
  readonly weightUnit: number | undefined;
  readonly distanceUnit: number | undefined;
}

function required(table: CsvTable, name: string): number {
  const index = table.columnIndex(name);
  if (index === undefined) throw new ImportError({ kind: 'missingColumn', column: name });
  return index;
}

function resolveColumns(table: CsvTable): Columns {
  return {
    date: required(table, 'Date'),
    workoutName: required(table, 'Workout Name'),
    exerciseName: required(table, 'Exercise Name'),
    setOrder: required(table, 'Set Order'),
    duration: table.columnIndex('Duration', 'Duration (sec)', 'Workout Duration'),
    weight: table.columnIndex('Weight', 'Weight (kg)', 'Weight (lbs)'),
    reps: table.columnIndex('Reps'),
    rpe: table.columnIndex('RPE'),
    distance: table.columnIndex('Distance', 'Distance (meters)'),
    seconds: table.columnIndex('Seconds'),
    notes: table.columnIndex('Notes'),
    workoutNotes: table.columnIndex('Workout Notes'),
    weightUnit: table.columnIndex('Weight Unit'),
    distanceUnit: table.columnIndex('Distance Unit'),
  };
}

/** Rounds to the nearest integer, halves away from zero (Swift's `rounded()`); never returns -0. */
function roundToInteger(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value)) + 0;
}

/** `text`, or `null` when it is empty. */
function nullIfEmpty(text: string): string | null {
  return text === '' ? null : text;
}

/** `value` when it is greater than zero, otherwise `null`: Strong writes 0 for "not recorded". */
function positiveOrNull(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function contentOf(order: string): StrongRowContent {
  switch (order.toLowerCase()) {
    case NonSetOrder.note:
      return { kind: 'note' };
    case NonSetOrder.restTimer:
      return { kind: 'restTimer' };
    default:
      return { kind: 'set', order };
  }
}

/**
 * Reads a Strong workouts export (`strong_workouts.csv`) into `StrongRow`s.
 *
 * Accepts both layouts seen in the wild (see `docs/DATA.md`):
 * - **Older**, comma-delimited: `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE`, with durations like `1h 7m`.
 * - **Newer**, semicolon-delimited: `Workout #;Date;Workout Name;Duration (sec);Exercise Name;Set Order;Weight (kg);Reps;RPE;Distance (meters);Seconds;Notes;Workout Notes`.
 *
 * Some exports add `Weight Unit` and `Distance Unit` columns; when present they set each row's unit
 * (kg/lb; m/km/mi). Without them the unit is inferred per exercise (`ExportUnitResolver`) and distance is meters.
 * Numbers may use a decimal comma; an ambiguous `1,234` is refused (`readExportNumber`).
 *
 * Strong writes timestamps in local time; they are read in the device's time zone.
 *
 * @throws ImportError if a required column is missing or a value is malformed.
 */
export function parseStrongWorkoutsFile(text: string): StrongRow[] {
  const table = CsvTable.parse(text);
  const columns = resolveColumns(table);

  return table.rows.map((fields, index): StrongRow => {
    const line = index + 2; // +1 for 1-based, +1 for the header
    const field = (column: number | undefined): string =>
      column === undefined ? '' : trimWhitespace(fields[column] ?? '');
    const number = (column: number | undefined, name: string): number | null => {
      const raw = field(column);
      if (raw === '') return null;
      const value = readExportNumber(raw);
      if (value === undefined) throw new ImportError({ kind: 'invalidValue', column: name, value: raw, line });
      return value;
    };

    const dateText = field(columns.date);
    const startedAt = parseStrongTimestamp(dateText);
    if (startedAt === undefined) throw new ImportError({ kind: 'invalidValue', column: 'Date', value: dateText, line });

    // A unit column, when the export has one, states each row's unit; blank cells leave it to inference.
    const unitText = field(columns.weightUnit);
    const exportUnit = unitText === '' ? undefined : readWeightUnit(unitText);
    if (unitText !== '' && exportUnit === undefined) {
      throw new ImportError({ kind: 'invalidValue', column: 'Weight Unit', value: unitText, line });
    }
    const distanceUnitText = field(columns.distanceUnit);
    const metersPerUnit = distanceUnitText === '' ? 1 : metersPerDistanceUnit(distanceUnitText);
    if (metersPerUnit === undefined) {
      throw new ImportError({ kind: 'invalidValue', column: 'Distance Unit', value: distanceUnitText, line });
    }
    const distance = positiveOrNull(number(columns.distance, 'distance'));

    return {
      line,
      ...(exportUnit === undefined ? {} : { exportUnit }),
      workoutKey: dateText,
      startedAt,
      workoutName: field(columns.workoutName),
      durationSeconds: parseStrongDuration(field(columns.duration)),
      exerciseName: field(columns.exerciseName),
      content: contentOf(field(columns.setOrder)),
      weightValue: number(columns.weight, 'weight') ?? 0,
      reps: roundToInteger(number(columns.reps, 'reps') ?? 0),
      rpe: number(columns.rpe, 'RPE'),
      distanceMeters: distance === null ? null : distance * metersPerUnit,
      seconds: positiveOrNull(number(columns.seconds, 'seconds')),
      notes: nullIfEmpty(field(columns.notes)),
      workoutNotes: nullIfEmpty(field(columns.workoutNotes)),
    };
  });
}

/**
 * Reads "1h 7m", "59m", "45s" or a plain number of seconds.
 * @returns Seconds, or `null` for an empty or unreadable value (duration is informational only).
 */
export function parseStrongDuration(text: string): number | null {
  if (text === '') return null;
  const plain = parseDecimal(text);
  if (plain !== undefined) return plain;

  let total = 0;
  let matched = false;
  for (const part of text.split(' ')) {
    if (part === '') continue;
    const unit = part.slice(-1);
    const amount = parseDecimal(part.slice(0, -1));
    if (amount === undefined) return null;
    switch (unit) {
      case 'h':
        total += amount * DurationUnitSeconds.hour;
        break;
      case 'm':
        total += amount * DurationUnitSeconds.minute;
        break;
      case 's':
        total += amount * DurationUnitSeconds.second;
        break;
      default:
        return null;
    }
    matched = true;
  }
  return matched && Number.isFinite(total) ? total : null;
}
