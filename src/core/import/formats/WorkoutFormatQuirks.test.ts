import { afterEach, describe, expect, test, vi } from 'vitest';
import { makeStrongImportPlan } from '../StrongImportPlan';
import { detectWorkoutFileFormat } from './detectWorkoutFileFormat';
import { parseFitbodWorkoutsFile } from './FitbodWorkoutsFile';
import { parseFitNotesWorkoutsFile } from './FitNotesWorkoutsFile';
import { WorkoutFileFixtures } from './fixtures/WorkoutFileFixtures';
import { parseHevyWorkoutsFile } from './HevyWorkoutsFile';
import { parseWorkoutTimestamp } from './parseWorkoutTimestamp';

afterEach(() => vi.unstubAllEnvs());

describe('export quirks of the supported apps', () => {
  test('Fitbod: offsets written without a colon keep their exact instant, whatever the phone time zone', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland');
    const rows = parseFitbodWorkoutsFile(WorkoutFileFixtures.fitbodWithOffsets);
    expect(rows.map((row) => row.startedAt)).toEqual([
      '2024-12-27T10:02:00.000Z',
      '2024-12-27T10:02:00.000Z',
      '2024-12-28T17:00:00.000Z',
    ]);
  });

  test('Fitbod: one workout per shared timestamp, warm-up flags, notes, cardio, and the multiplier left alone', () => {
    const rows = parseFitbodWorkoutsFile(WorkoutFileFixtures.fitbodWithOffsets);
    const plan = makeStrongImportPlan(rows);
    expect(plan.workouts).toHaveLength(2);
    const sets = plan.workouts[0]?.exercises[0]?.sets ?? [];
    expect(sets.map((set) => set.kind)).toEqual(['warmup', 'working']);
    expect(sets[1]).toMatchObject({ weightKilograms: 12.7, entryUnit: 'kg', notes: 'Slow, controlled' });
    expect(plan.workouts[1]?.exercises[0]?.sets[0]).toMatchObject({ durationSeconds: 600, distanceMeters: 2000 });
  });

  test.each([
    ['2024-12-27 10:02:51 +0000', '2024-12-27T10:02:51.000Z'],
    ['2024-12-27 10:02:51 -0530', '2024-12-27T15:32:51.000Z'],
    ['2024-12-27T10:02:51+01:00', '2024-12-27T09:02:51.000Z'],
    ['2024-12-27T10:02:51Z', '2024-12-27T10:02:51.000Z'],
  ])('timestamp %s is the instant %s', (text, instant) => {
    expect(parseWorkoutTimestamp(text)).toBe(instant);
  });

  test('Fitbod and Hevy files are recognised from their published headers', () => {
    expect(detectWorkoutFileFormat(WorkoutFileFixtures.fitbodWithOffsets)).toBe('fitbod');
    expect(detectWorkoutFileFormat(WorkoutFileFixtures.hevyKilograms)).toBe('hevy');
  });

  test('Hevy: a kilogram export keeps kg as the entry unit, decimals and RPE, and groups by start time', () => {
    vi.stubEnv('TZ', 'UTC');
    const plan = makeStrongImportPlan(parseHevyWorkoutsFile(WorkoutFileFixtures.hevyKilograms));
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0]).toMatchObject({
      startedAt: '2025-01-03T07:05:00.000Z',
      endedAt: '2025-01-03T08:00:00.000Z',
    });
    expect(plan.workouts[0]?.exercises[0]?.sets[0]).toMatchObject({
      weightKilograms: 52.5,
      entryUnit: 'kg',
      rpe: 8.5,
      reps: 10,
    });
  });

  test('FitNotes: a decimal-comma file with a grouped distance is read exactly, and an ambiguous cell is refused', () => {
    const header = 'Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment';
    const [row] = parseFitNotesWorkoutsFile(`${header}\n2024-03-10,Run,Cardio,,0,"1,500.5",m,00:10:00,`);
    expect(row?.distanceMeters).toBe(1500.5);
    expect(() => parseFitNotesWorkoutsFile(`${header}\n2024-03-10,Run,Cardio,,0,"1,500",m,00:10:00,`)).toThrow(
      'Distance',
    );
  });

  test('FitNotes current layout: the unit comes from each row, cardio and timed rows keep their time and distance', () => {
    const rows = parseFitNotesWorkoutsFile(WorkoutFileFixtures.fitnotesWeightUnit);
    expect(rows.map((row) => [row.weightValue, row.exportUnit])).toEqual([
      [80, 'kg'],
      [135, 'lb'],
      [0, 'kg'],
      [0, 'kg'],
    ]);
    expect(rows[1]?.notes).toBe('Slow, controlled');
    expect(rows[2]).toMatchObject({ distanceMeters: 5000, seconds: 1800 });
    expect(rows[3]?.seconds).toBe(75);
  });

  test('FitNotes iOS layout: Weight (kg) / Weight (lbs), Notes and the Kind column', () => {
    const rows = parseFitNotesWorkoutsFile(WorkoutFileFixtures.fitnotesTwoLayout);
    expect(rows.map((row) => [row.weightValue, row.exportUnit])).toEqual([
      [80, 'kg'],
      [135, 'lb'],
    ]);
    expect(rows[1]?.notes).toBe('Pause, squeeze');
  });

  test('Regression: a weight column this parser does not know stops the import instead of storing zero weights', () => {
    const text = 'Date,Exercise,Category,Gewicht,Weight (stone),Reps\n2026-04-29,Bench,Chest,80,12,5';
    expect(() => parseFitNotesWorkoutsFile(text)).toThrow('Weight (kgs)');
    expect(() => parseHevyWorkoutsFile('title,start_time,exercise_title,Weight (kg)\nA,2024-01-01,Bench,80')).toThrow(
      'weight_kg',
    );
    expect(() => parseFitbodWorkoutsFile('Date,Exercise,Reps,Weight\n2024-01-01,Curl,8,20')).toThrow('Weight(kg)');
  });

  test('FitNotes: an unknown unit beside a weight is refused rather than assumed', () => {
    const header = 'Date,Exercise,Category,Weight,Weight Unit,Reps';
    expect(() => parseFitNotesWorkoutsFile(`${header}\n2026-04-29,Bench,Chest,80,stone,5`)).toThrow('Weight Unit');
    expect(() => parseFitNotesWorkoutsFile(`${header}\n2026-04-29,Bench,Chest,80,,5`)).toThrow('Weight Unit');
  });

  test('A file with no weight column at all (cardio only) reads as weight 0', () => {
    const [row] = parseFitNotesWorkoutsFile(
      'Date,Exercise,Category,Distance,Distance Unit,Time\n2026-05-02,Run,Cardio,5,km,30:00',
    );
    expect(row).toMatchObject({ weightValue: 0, distanceMeters: 5000, seconds: 1800 });
  });

  test('Fitbod: numbers padded with a leading space are read exactly', () => {
    const rows = parseFitbodWorkoutsFile(WorkoutFileFixtures.fitbodPadded);
    expect(rows.map((row) => [row.reps, row.weightValue])).toEqual([
      [10, 20],
      [8, 60],
    ]);
    expect(rows[1]?.notes).toBe('felt heavy, stop at 8');
  });

  test('FitNotes and Fitbod headers from the research are detected', () => {
    expect(detectWorkoutFileFormat(WorkoutFileFixtures.fitnotesWeightUnit)).toBe('fitnotes');
    expect(detectWorkoutFileFormat(WorkoutFileFixtures.fitnotesTwoLayout)).toBe('fitnotes');
    expect(detectWorkoutFileFormat(WorkoutFileFixtures.fitbodPadded)).toBe('fitbod');
  });
});
