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
});
