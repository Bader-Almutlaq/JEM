import { BodyMeasurementSite, type BodyMeasurement } from '../models/BodyMeasurement';
import type { MeasurementState } from '../measurements/MeasurementSite';
import { storedMeasurementValue } from '../measurements/MeasurementUnits';
import { CsvTable } from './CsvTable';
import { ImportError } from './ImportError';
import { readExportNumber } from './readExportNumber';
import { parseStrongTimestamp } from './StrongTimestamp';
import { trimWhitespace } from './trimWhitespace';

/** Exact measurement conversion constants, retained here for existing import callers. */
export { MeasurementConversion } from '../measurements/MeasurementUnits';

/** A measurement read from a Strong export, ready to store (the database assigns the `id`). */
export type PlannedMeasurement = Omit<BodyMeasurement, 'id' | 'state' | 'entryUnit'> & {
  /** Absent for legacy files; imported as relaxed. */
  readonly state?: MeasurementState;
};

/** Whether `table` looks like a measurements export (used to sort picked files). */
export function isStrongMeasurementsFile(table: CsvTable): boolean {
  return table.columnIndex('Measurement Type') !== undefined && table.columnIndex('Value') !== undefined;
}

/**
 * Reads one Strong body-measurement export (e.g. `strong_waist.csv`).
 *
 * Header: `Date,Measurement Type,Value,Unit,Source`. Strong writes one file per measurement site.
 * An optional State column accepts relaxed or flexed; missing or empty state defaults to relaxed.
 * Circumferences are stored in centimetres; a bodyweight file is stored in kilograms under
 * `BodyMeasurementSite.bodyweight`. Timestamps are local time, read in the device's time zone.
 *
 * @throws ImportError if a required column is missing or a value is malformed.
 */
export function parseStrongMeasurementsFile(text: string): PlannedMeasurement[] {
  const table = CsvTable.parse(text);
  const requiredColumn = (name: string): number => {
    const index = table.columnIndex(name);
    if (index === undefined) throw new ImportError({ kind: 'missingColumn', column: name });
    return index;
  };
  const date = requiredColumn('Date');
  const type = requiredColumn('Measurement Type');
  const value = requiredColumn('Value');
  const unit = table.columnIndex('Unit');
  const state = table.columnIndex('State');

  return table.rows.map((fields, index): PlannedMeasurement => {
    const line = index + 2;
    const dateText = trimWhitespace(fields[date] ?? '');
    const takenAt = parseStrongTimestamp(dateText);
    if (takenAt === undefined) throw new ImportError({ kind: 'invalidValue', column: 'Date', value: dateText, line });
    const valueText = trimWhitespace(fields[value] ?? '');
    // The same number rule as workout files: a decimal comma is fine, an ambiguous `1,234` is refused, not guessed.
    const number = readExportNumber(valueText);
    if (number === undefined) throw new ImportError({ kind: 'invalidValue', column: 'Value', value: valueText, line });
    const unitText = unit === undefined ? 'cm' : trimWhitespace(fields[unit] ?? '').toLowerCase();
    const storedValue = normaliseMeasurement(number, unitText);
    if (!Number.isFinite(storedValue)) {
      throw new ImportError({ kind: 'invalidValue', column: 'Value', value: valueText, line });
    }
    const stateText = state === undefined ? '' : trimWhitespace(fields[state] ?? '').toLowerCase();
    if (stateText !== '' && stateText !== 'relaxed' && stateText !== 'flexed') {
      throw new ImportError({ kind: 'invalidValue', column: 'State', value: stateText, line });
    }
    return {
      takenAt,
      site: measurementSiteSlug(fields[type] ?? ''),
      value: storedValue,
      source: 'strong',
      ...(stateText === '' ? {} : { state: stateText }),
    };
  });
}

/** "Left Bicep" → "left-bicep"; any bodyweight label → `BodyMeasurementSite.bodyweight`. */
export function measurementSiteSlug(type: string): string {
  const lowered = trimWhitespace(type.toLowerCase());
  if (lowered === 'weight' || lowered.includes('body weight') || lowered === 'bodyweight') {
    return BodyMeasurementSite.bodyweight;
  }
  return lowered
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((word) => word !== '')
    .join('-');
}

/** Converts to the stored unit: cm for circumferences, kg for bodyweight. */
export function normaliseMeasurement(value: number, unit: string): number {
  switch (unit) {
    case 'in':
    case 'inch':
    case 'inches':
      return storedMeasurementValue(value, 'in');
    case 'lb':
    case 'lbs':
      return storedMeasurementValue(value, 'lb');
    default:
      return value;
  }
}
