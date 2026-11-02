import { afterEach, beforeEach, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { LiftTrends } from './LiftTrends';
let db: Database;
beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
});
afterEach(() => db.close());
test('counts qualifying sessions and excludes deload entries', () => {
  const exercise = db.run(
    `INSERT INTO exercise (name, source, createdAt, tracking, mechanic) VALUES ('Test', 'custom', '2024-01-01', 'weight-reps', 'isolation')`,
  ).lastInsertRowId;
  for (let day = 1; day <= 4; day++) {
    const id = db.run(`INSERT INTO workout (name, source, startedAt, isInProgress) VALUES ('Test', 'app', ?, 0)`, [
      `2024-01-0${day}T12:00:00.000Z`,
    ]).lastInsertRowId;
    const entry = db.run(
      `INSERT INTO workoutExercise (workoutId, exerciseId, position, machineBrand, deloadStage) VALUES (?, ?, 0, ?, ?)`,
      [id, exercise, day === 2 ? 'Second' : 'First', day === 4 ? 1 : null],
    ).lastInsertRowId;
    db.run(
      `INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, isCompleted) VALUES (?, 0, 'working', 100, 'kg', 1, 10, 1)`,
      [entry],
    );
  }
  const lifts = LiftTrends(db, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-08T00:00:00Z'));
  expect(lifts).toHaveLength(1);
  expect(lifts[0]).toMatchObject({ sessions: 3, latest: 100, changePercent: 0, mixedMachines: true });
});

test('median ignores ordering and averages the middle two changes', async () => {
  const { medianLiftChange } = await import('./LiftTrends');
  const base = { id: 1, name: 'A', unit: 'kg' as const, sessions: 2, latest: 100, mixedMachines: false, points: [] };
  expect(
    medianLiftChange([
      { ...base, changePercent: 10 },
      { ...base, changePercent: -2 },
      { ...base, changePercent: 4 },
      { ...base, changePercent: 2 },
    ]),
  ).toBe(3);
  expect(medianLiftChange([])).toBeNull();
});

test('ranks changes and reports elapsed weeks since a best', () => {
  for (const [id, name, second] of [
    [1, 'Gain', 110],
    [2, 'Drop', 90],
  ] as const) {
    db.run(
      "INSERT INTO exercise (id, name, source, createdAt, tracking, mechanic) VALUES (?, ?, 'custom', '2024-01-01', 'weight-reps', 'isolation')",
      [id, name],
    );
    for (const [day, weight] of [
      [1, 100],
      [8, second],
    ] as const) {
      const workout = db.run(
        "INSERT INTO workout (name, source, startedAt, isInProgress) VALUES ('Test', 'app', ?, 0)",
        [`2024-01-${String(day).padStart(2, '0')}T12:00:00.000Z`],
      ).lastInsertRowId;
      const entry = db.run('INSERT INTO workoutExercise (workoutId, exerciseId, position) VALUES (?, ?, 0)', [
        workout,
        id,
      ]).lastInsertRowId;
      db.run(
        "INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, isCompleted) VALUES (?, 0, 'working', ?, 'kg', 1, 10, 1)",
        [entry, weight],
      );
    }
  }
  const result = LiftTrends(db, new Date('2024-01-01T00:00:00Z'), new Date('2024-03-01T00:00:00Z'));
  expect(result.map((lift) => lift.name)).toEqual(['Gain', 'Drop']);
  expect(result[0]?.weeksSinceBest).toBe(7);
  expect(result[1]?.weeksSinceBest).toBe(8);
});

function addExercise(name: string): number {
  return db.run(
    `
    INSERT INTO exercise (name, source, createdAt, tracking, mechanic)
    VALUES (?, 'custom', '2024-01-01', 'weight-reps', 'isolation')
  `,
    [name],
  ).lastInsertRowId;
}

function addSession(exercise: number, date: string, weight: number, deload = false, reps = 1) {
  const workout = db.run(
    `
    INSERT INTO workout (name, source, startedAt, isInProgress)
    VALUES ('Synthetic', 'app', ?, 0)
  `,
    [date],
  ).lastInsertRowId;
  const entry = db.run(
    `
    INSERT INTO workoutExercise (workoutId, exerciseId, position, deloadStage)
    VALUES (?, ?, 0, ?)
  `,
    [workout, exercise, deload ? 1 : null],
  ).lastInsertRowId;
  db.run(
    `
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, isCompleted)
    VALUES (?, 0, 'working', ?, 'kg', ?, 10, 1)
  `,
    [entry, weight, reps],
  );
}

test('excludes sparse lifts even with older history, a deload or a nonqualifying second session', async () => {
  const { strengthIndexReport } = await import('./LiftTrends');
  const sparse = addExercise('One in period');
  addSession(sparse, '2023-12-01T12:00:00Z', 100);
  addSession(sparse, '2023-12-08T12:00:00Z', 100);
  addSession(sparse, '2024-01-02T12:00:00Z', 100);
  const deload = addExercise('One plus deload');
  addSession(deload, '2024-01-02T12:00:00Z', 100);
  addSession(deload, '2024-01-03T12:00:00Z', 100, true);
  const nonqualifying = addExercise('One plus high reps');
  addSession(nonqualifying, '2024-01-02T12:00:00Z', 100);
  addSession(nonqualifying, '2024-01-03T12:00:00Z', 100, false, 20);
  const counted = addExercise('Two sessions');
  addSession(counted, '2024-01-02T12:00:00Z', 100);
  addSession(counted, '2024-01-09T12:00:00Z', 110);
  const from = new Date('2024-01-01T00:00:00Z');
  const to = new Date('2024-01-29T00:00:00Z');
  const report = strengthIndexReport(db, from, to);
  expect(report.lifts.map((lift) => lift.name)).toEqual(['Two sessions']);
  expect(report.counts).toEqual({ up: 1, flat: 0, down: 0 });
  const expected = 10 * (1 - Math.exp(-7 / 21));
  expect(report.medianChangePercent).toBeCloseTo(expected);
  expect(report.points.at(-1)?.changePercent).toBeCloseTo(expected);
});

test('excludes deloads from the smoothed query and agrees with index at both period boundaries', async () => {
  const { strengthIndexReport } = await import('./LiftTrends');
  const exercise = addExercise('With deload');
  addSession(exercise, '2023-12-25T00:00:00Z', 100);
  addSession(exercise, '2024-01-01T00:00:00Z', 110);
  addSession(exercise, '2024-01-05T00:00:00Z', 50, true);
  addSession(exercise, '2024-01-08T00:00:00Z', 110);
  addSession(exercise, '2024-01-29T00:00:00Z', 90);
  const report = strengthIndexReport(db, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-29T00:00:00Z'));
  expect(report.lifts[0]?.sessions).toBe(2);
  expect(report.lifts[0]?.points).toHaveLength(2);
  expect(report.points[0]?.changePercent).toBe(0);
  expect(report.points.at(-1)?.changePercent).toBeCloseTo(report.medianChangePercent ?? NaN);
  expect(report.medianChangePercent).toBeGreaterThan(0);
});
