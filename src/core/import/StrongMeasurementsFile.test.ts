import { describe, expect, test, vi } from 'vitest';
import { BodyMeasurementSite } from '../models/BodyMeasurement';
import { CsvTable } from './CsvTable';
import { expectImportError } from './fixtures/expectImportError';
import { OLDER_LAYOUT, WAIST } from './fixtures/StrongFixtures';
import {
  isStrongMeasurementsFile,
  measurementSiteSlug,
  normaliseMeasurement,
  parseStrongMeasurementsFile,
} from './StrongMeasurementsFile';

vi.stubEnv('TZ', 'UTC');

describe('Strong measurements file', () => {
  test('Optional state accepts relaxed and flexed, defaults missing values, and rejects invalid values', () => {
    const values = parseStrongMeasurementsFile(
      'Date,Measurement Type,Value,Unit,State\n2024-01-01 10:00:00,Waist,80,cm, FLEXED \n2024-01-01 10:00:00,Waist,79,cm,relaxed\n2024-01-02 10:00:00,Waist,78,cm,',
    );
    expect(values.map((value) => value.state ?? 'relaxed')).toEqual(['flexed', 'relaxed', 'relaxed']);
    expectImportError(
      () => parseStrongMeasurementsFile('Date,Measurement Type,Value,State\n2024-01-01 10:00:00,Waist,80,tense'),
      { kind: 'invalidValue', column: 'State', value: 'tense', line: 2 },
    );
  });
  test.each([' 2024-01-01 10:00:00 , Waist , 31 , IN ', '2024-01-01 10:00:00,Waist,31, IN '])(
    'Surrounding field whitespace cannot turn 31 inches into 31 centimetres: %s',
    (row) => {
      const [measurement] = parseStrongMeasurementsFile(`Date,Measurement Type,Value,Unit\n${row}`);
      // 31 × 2.54 = 78.74 cm; use the same field trimming as workout exports.
      expect(measurement).toMatchObject({ site: 'waist', value: 78.74, takenAt: '2024-01-01T10:00:00.000Z' });
    },
  );

  test('Overflowing measurement values are refused before storage', () => {
    expectImportError(
      () => parseStrongMeasurementsFile('Date,Measurement Type,Value,Unit\n2024-01-01 10:00:00,Waist,1e309,cm'),
      {
        kind: 'invalidValue',
        column: 'Value',
        value: '1e309',
        line: 2,
      },
    );
  });

  test('Finite inches that overflow centimetres are refused before storage', () => {
    expectImportError(
      () => parseStrongMeasurementsFile('Date,Measurement Type,Value,Unit\n2024-01-01 10:00:00,Waist,1e308,in'),
      { kind: 'invalidValue', column: 'Value', value: '1e308', line: 2 },
    );
  });

  test('Measurements: site slugs and inches converted to centimetres', () => {
    const values = parseStrongMeasurementsFile(WAIST);
    expect(values.map((value) => value.site)).toEqual(['waist', 'waist']);
    expect(values[0]?.value).toBe(78);
    expect(Math.abs((values[1]?.value ?? 0) - 78.74)).toBeLessThan(1e-9);
    expect(measurementSiteSlug('Left Bicep')).toBe('left-bicep');
    expect(measurementSiteSlug('Body Weight')).toBe(BodyMeasurementSite.bodyweight);
  });

  test('Rows carry the local time as UTC and the Strong source', () => {
    const values = parseStrongMeasurementsFile(WAIST);
    expect(values[0]).toEqual({ takenAt: '2026-02-18T09:13:35.000Z', site: 'waist', value: 78, source: 'strong' });
  });

  test('Every bodyweight label maps to the bodyweight site', () => {
    for (const label of ['Weight', 'weight', 'Bodyweight', 'Body Weight', ' body weight (kg)']) {
      expect(measurementSiteSlug(label)).toBe(BodyMeasurementSite.bodyweight);
    }
  });

  test('Site slugs split on anything that is not a letter or digit', () => {
    expect(measurementSiteSlug('  Upper  Abs ')).toBe('upper-abs');
    expect(measurementSiteSlug('Left Forearm (relaxed)')).toBe('left-forearm-relaxed');
    expect(measurementSiteSlug('Hips')).toBe('hips');
  });

  test('Units are normalised to centimetres or kilograms', () => {
    expect(normaliseMeasurement(10, 'in')).toBe(25.4);
    expect(normaliseMeasurement(10, 'inches')).toBe(25.4);
    expect(normaliseMeasurement(10, 'inch')).toBe(25.4);
    expect(normaliseMeasurement(100, 'lb')).toBeCloseTo(45.359237, 9);
    expect(normaliseMeasurement(100, 'lbs')).toBeCloseTo(45.359237, 9);
    expect(normaliseMeasurement(80, 'cm')).toBe(80);
    expect(normaliseMeasurement(80, 'kg')).toBe(80);
  });

  test('A file without a Unit column is read as centimetres; a decimal comma is accepted', () => {
    const [value] = parseStrongMeasurementsFile('Date,Measurement Type,Value\n2026-02-18 09:13:35,Neck,"38,5"');
    expect(value?.value).toBe(38.5);
  });

  test('Values follow the workout-file number rule: grouping is read, an ambiguous comma is refused', () => {
    const read = (value: string) =>
      parseStrongMeasurementsFile(`Date,Measurement Type,Value,Unit\n2026-02-18 09:13:35,Bodyweight,"${value}",kg`)[0]
        ?.value;
    expect(read('1.234,5')).toBe(1234.5);
    expect(read('1,234.5')).toBe(1234.5);
    // Regression: this used to be read silently as 1.234.
    expectImportError(
      () => parseStrongMeasurementsFile('Date,Measurement Type,Value\n2026-02-18 09:13:35,Waist,"1,234"'),
      { kind: 'invalidValue', column: 'Value', value: '1,234', line: 2 },
    );
  });

  test('Measurement files are told apart from workout files', () => {
    expect(isStrongMeasurementsFile(CsvTable.parse(WAIST))).toBe(true);
    expect(isStrongMeasurementsFile(CsvTable.parse(OLDER_LAYOUT))).toBe(false);
  });

  test('Missing columns, bad dates and bad values are reported with their line', () => {
    expectImportError(() => parseStrongMeasurementsFile('Date,Value\n'), {
      kind: 'missingColumn',
      column: 'Measurement Type',
    });
    expectImportError(() => parseStrongMeasurementsFile('Measurement Type,Value\n'), {
      kind: 'missingColumn',
      column: 'Date',
    });
    expectImportError(() => parseStrongMeasurementsFile('Date,Measurement Type\n'), {
      kind: 'missingColumn',
      column: 'Value',
    });
    expectImportError(() => parseStrongMeasurementsFile('Date,Measurement Type,Value\nyesterday,Neck,38'), {
      kind: 'invalidValue',
      column: 'Date',
      value: 'yesterday',
      line: 2,
    });
    expectImportError(() => parseStrongMeasurementsFile('Date,Measurement Type,Value\n2026-02-18 09:13:35,Neck,wide'), {
      kind: 'invalidValue',
      column: 'Value',
      value: 'wide',
      line: 2,
    });
  });
});
