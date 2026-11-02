import { describe, expect, test, vi } from 'vitest';
import { expectImportError } from './fixtures/expectImportError';
import { EUROPEAN_WITH_UNITS, NEWER_LAYOUT, OLDER_LAYOUT } from './fixtures/StrongFixtures';
import { parseStrongDuration, parseStrongWorkoutsFile } from './StrongWorkoutsFile';

vi.stubEnv('TZ', 'UTC');

describe('Strong workouts file', () => {
  test('Older layout: rows, set orders, durations, notes and quoted names', () => {
    const rows = parseStrongWorkoutsFile(OLDER_LAYOUT);
    expect(rows).toHaveLength(6);
    expect(rows[0]?.workoutName).toBe('Push, heavy');
    expect(rows[0]?.content).toEqual({ kind: 'set', order: 'W' });
    expect(rows[0]?.durationSeconds).toBe(4020); // 1h 7m
    expect(rows[0]?.workoutNotes).toBe('Felt good');
    expect(rows[0]?.rpe).toBeNull();
    expect(rows[1]?.weightValue).toBe(61.23);
    expect(rows[1]?.line).toBe(3);
    expect(rows[5]?.content).toEqual({ kind: 'set', order: 'D' });
  });

  test('Newer layout: semicolons, Note and Rest Timer rows, decimal RPE', () => {
    const rows = parseStrongWorkoutsFile(NEWER_LAYOUT);
    expect(rows.map((row) => row.content)).toEqual([
      { kind: 'set', order: '1' },
      { kind: 'note' },
      { kind: 'restTimer' },
      { kind: 'set', order: '2' },
    ]);
    expect(rows[0]?.rpe).toBe(8.5);
    expect(rows[0]?.durationSeconds).toBe(3600);
    expect(rows[1]?.notes).toBe('Use the wide bar');
  });

  test.each([
    ['1h 7m', 4020],
    ['59m', 3540],
    ['45s', 45],
    ['3600', 3600],
  ])('Durations in every format Strong uses: %s', (text, seconds) => {
    expect(parseStrongDuration(text)).toBe(seconds);
  });

  test('Missing columns and bad dates are reported with their line', () => {
    expectImportError(() => parseStrongWorkoutsFile('Date,Workout Name,Set Order\n'), {
      kind: 'missingColumn',
      column: 'Exercise Name',
    });
    const badDate = 'Date,Workout Name,Exercise Name,Set Order\n01/02/2024,A,B,1';
    expectImportError(() => parseStrongWorkoutsFile(badDate), {
      kind: 'invalidValue',
      column: 'Date',
      value: '01/02/2024',
      line: 2,
    });
  });
});

describe('Strong workouts file details beyond the native tests', () => {
  const HEADER =
    'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE';

  test('Unreadable durations are ignored, not errors', () => {
    expect(parseStrongDuration('')).toBeNull();
    expect(parseStrongDuration('soon')).toBeNull();
    expect(parseStrongDuration('1h 7x')).toBeNull();
    expect(parseStrongDuration('h')).toBeNull();
    expect(parseStrongDuration('1h  7m')).toBe(4020);
    expect(parseStrongDuration('1.5h')).toBe(5400);
  });

  test('Duration arithmetic cannot turn a finite amount into infinite seconds', () => {
    // 10^308 hours × 3600 exceeds the largest finite binary64 number.
    expect(parseStrongDuration('1e308h')).toBeNull();
  });

  test('Overflowing decimal weights are rejected with their source location', () => {
    expectImportError(() => parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,1e309,5,0,0,,,`), {
      kind: 'invalidValue',
      column: 'weight',
      value: '1e309',
      line: 2,
    });
  });

  test('A non-numeric weight, reps or RPE is reported with its column and line', () => {
    const row = (weight: string, reps: string, rpe: string): string =>
      `${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,${weight},${reps},0,0,,,${rpe}`;
    expectImportError(() => parseStrongWorkoutsFile(row('heavy', '5', '')), {
      kind: 'invalidValue',
      column: 'weight',
      value: 'heavy',
      line: 2,
    });
    expectImportError(() => parseStrongWorkoutsFile(row('5', 'x', '')), {
      kind: 'invalidValue',
      column: 'reps',
      value: 'x',
      line: 2,
    });
    expectImportError(() => parseStrongWorkoutsFile(row('5', '5', 'hard')), {
      kind: 'invalidValue',
      column: 'RPE',
      value: 'hard',
      line: 2,
    });
  });

  test('Infinity, NaN and hex numbers are refused rather than stored', () => {
    for (const weight of ['Infinity', 'NaN', '0x10']) {
      expect(() => parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,${weight},5,0,0,,,`)).toThrowError(
        /isn't a valid weight/,
      );
    }
  });

  test('A decimal comma is read as a point; reps round half away from zero', () => {
    const [row] = parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,"62,5",8.5,0,0,,,`);
    expect(row?.weightValue).toBe(62.5);
    expect(row?.reps).toBe(9);
    const [rounded] = parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,5,7.4,0,0,,,`);
    expect(rounded?.reps).toBe(7);
  });

  test('Missing weight or reps read as zero; zero distance and seconds read as not recorded', () => {
    const [row] = parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,,,0,0,,,`);
    expect(row?.weightValue).toBe(0);
    expect(row?.reps).toBe(0);
    expect(row?.distanceMeters).toBeNull();
    expect(row?.seconds).toBeNull();
    const [timed] = parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,0,0,150.5,30,,,`);
    expect(timed?.distanceMeters).toBe(150.5);
    expect(timed?.seconds).toBe(30);
  });

  test('Columns are found by name in any order, and optional columns may be absent', () => {
    const [row] = parseStrongWorkoutsFile(
      'Reps,Set Order,Exercise Name,Workout Name,Date\n5,2,Row,Pull,2024-01-01 10:00:00',
    );
    expect(row).toMatchObject({
      reps: 5,
      exerciseName: 'Row',
      workoutName: 'Pull',
      weightValue: 0,
      durationSeconds: null,
    });
    expect(row?.content).toEqual({ kind: 'set', order: '2' });
  });

  test('Set Order "note" and "rest timer" are recognised whatever their case', () => {
    const rows = parseStrongWorkoutsFile(
      'Date,Workout Name,Exercise Name,Set Order\n2024-01-01 10:00:00,A,B,NOTE\n2024-01-01 10:00:00,A,B,Rest TIMER',
    );
    expect(rows.map((row) => row.content.kind)).toEqual(['note', 'restTimer']);
  });

  test('Values are trimmed; the workout key is the trimmed timestamp text', () => {
    const [row] = parseStrongWorkoutsFile(`${HEADER}\n 2024-01-01 10:00:00 , Push ,1h, Bench ,1, 60 ,5,0,0,,,`);
    expect(row).toMatchObject({
      workoutKey: '2024-01-01 10:00:00',
      workoutName: 'Push',
      exerciseName: 'Bench',
      weightValue: 60,
    });
  });

  test('Line numbers count rows after the header, ignoring blank lines', () => {
    const rows = parseStrongWorkoutsFile(
      `${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,5,5,0,0,,,\n\n2024-01-01 10:00:00,A,1h,B,2,5,5,0,0,,,`,
    );
    expect(rows.map((row) => row.line)).toEqual([2, 3]);
  });

  test('The start instant is the local timestamp converted to UTC', () => {
    const [row] = parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,5,5,0,0,,,`);
    expect(row?.startedAt).toBe('2024-01-01T10:00:00.000Z');
  });

  test('A continental export: semicolons, decimal commas, per-row weight and distance units', () => {
    const rows = parseStrongWorkoutsFile(EUROPEAN_WITH_UNITS);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ workoutName: 'Rücken, schwer', weightValue: 62.5, rpe: 8.5, exportUnit: 'kg' });
    expect(rows[1]).toMatchObject({ distanceMeters: 2400, seconds: 750 });
    // A blank Distance Unit means meters; a lb row keeps its own unit.
    expect(rows[2]).toMatchObject({ weightValue: 135, exportUnit: 'lb', distanceMeters: null });
  });

  test('Rows without a unit column leave the unit to inference', () => {
    const [row] = parseStrongWorkoutsFile(`${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,60,8,0,0,,,`);
    expect(row).not.toHaveProperty('exportUnit');
  });

  test('An unknown or unusable unit is reported with its column rather than guessed', () => {
    const header = 'Date,Workout Name,Exercise Name,Set Order,Weight,Weight Unit,Reps,Distance,Distance Unit';
    expect(() => parseStrongWorkoutsFile(`${header}\n2024-01-01 10:00:00,A,B,1,60,stone,8,0,`)).toThrow('Weight Unit');
    expect(() => parseStrongWorkoutsFile(`${header}\n2024-01-01 10:00:00,A,B,1,60,kg,8,5,furlongs`)).toThrow(
      'Distance Unit',
    );
  });

  test('Regression: a grouped "1,000" or an ambiguous "1,234" is not silently read as a kilogram or two', () => {
    const text = (weight: string) => `${HEADER}\n2024-01-01 10:00:00,A,1h,B,1,"${weight}",8,0,0,,,`;
    expect(parseStrongWorkoutsFile(text('1,000.5'))[0]?.weightValue).toBe(1000.5);
    expect(parseStrongWorkoutsFile(text('1.000,5'))[0]?.weightValue).toBe(1000.5);
    expect(() => parseStrongWorkoutsFile(text('1,234'))).toThrow('1,234');
  });

  test('The older semicolon layout with unit columns and a trailing Workout Duration is read', () => {
    const text = [
      'Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration',
      '2013-01-03 13:54:52;Legs;Squat;1;100;kg;5;8;0;km;0;;;50m',
      '2013-01-03 13:54:52;Legs;Run;1;0;kg;0;;2;km;56;;;56s',
    ].join('\n');
    const rows = parseStrongWorkoutsFile(text);
    expect(rows.map((row) => row.durationSeconds)).toEqual([3000, 56]);
    expect(rows[0]).toMatchObject({ weightValue: 100, exportUnit: 'kg', rpe: 8 });
    expect(rows[1]?.distanceMeters).toBe(2000);
  });
});
