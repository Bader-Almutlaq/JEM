import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Database } from './Database';
import { ExerciseChangeLimits } from './ExerciseChanges';
import { migrate, MIGRATIONS } from './migrations';
import { ExerciseEditor } from '../library/ExerciseEditor';
import { importStrongPlan } from '../import/StrongImporter';
import { makeStrongImportPlan } from '../import/StrongImportPlan';
import { parseStrongWorkoutsFile } from '../import/StrongWorkoutsFile';
import { OLDER_LAYOUT } from '../import/fixtures/StrongFixtures';
import type { ExerciseRow } from '../models/Exercise';
import { ExerciseSessions } from '../queries/ExerciseSessions';
import { ExerciseCurve } from '../queries/ExerciseCurve';
import { ExerciseSeries } from '../queries/ExerciseSeries';
import { ExerciseStrength } from '../queries/ExerciseStrength';
import { LiftTrends, strengthIndexReport } from '../queries/LiftTrends';

/** Heuristic: small deterministic history with shared workouts, an unrelated lift and an unused lift. */
const Fixture = Object.freeze({
  ids: [1, 2, 3, 4] as const,
  now: new Date('2026-11-02T12:00:00.000Z'),
  earlier: new Date('2026-10-03T12:00:00.000Z'),
  randomSeed: 94,
  randomSteps: 60,
  randomMultiplier: 16_807,
  randomModulus: 2_147_483_647,
});
let db: Database;

beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
  for (const id of Fixture.ids) {
    db.run(
      `
        INSERT INTO exercise (id, name, equipment, mechanic, source, createdAt)
        VALUES (?, ?, 'barbell', 'isolation', 'custom', ?)
      `,
      [id, `Synthetic ${id}`, Fixture.earlier.toISOString()],
    );
  }
  for (const id of [1, 2]) {
    db.run(
      `
        INSERT INTO template (id, name, position, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `,
      [id, `Synthetic template ${id}`, id, Fixture.earlier.toISOString(), Fixture.earlier.toISOString()],
    );
  }
  for (let workout = 1; workout <= 6; workout += 1) {
    db.run(
      `
        INSERT INTO workout (id, startedAt, endedAt, name, source, templateId)
        VALUES (?, ?, ?, 'Synthetic', 'app', 1)
      `,
      [workout, `2026-10-0${workout}T10:00:00.000Z`, `2026-10-0${workout}T11:00:00.000Z`],
    );
    const exercises = workout % 2 === 1 ? [1, 2] : [3];
    for (const [position, exercise] of exercises.entries()) {
      const entry = db.run('INSERT INTO workoutExercise (workoutId, exerciseId, position) VALUES (?, ?, ?)', [
        workout,
        exercise,
        position,
      ]).lastInsertRowId;
      for (let set = 0; set < 4; set += 1) {
        db.run(
          `
            INSERT INTO workoutSet
              (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe)
            VALUES (?, ?, 'working', ?, 'kg', ?, 9)
          `,
          [entry, set, 50 + workout + set, 5 + set],
        );
      }
    }
  }
  db.run("INSERT INTO exerciseMuscle (exerciseId, muscleId, role) VALUES (1, 'chest', 'primary')");
});
afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
});

function read(database: Database, id: number, now = Fixture.now) {
  const row = database.get<ExerciseRow>('SELECT * FROM exercise WHERE id = ?', [id]);
  return {
    all: ExerciseSessions.all(database, id, now),
    page: ExerciseSessions.page(database, id, now, 2, 1),
    scoped: ExerciseSeries.read(database, id, now, 1),
    series: ExerciseSeries.read(database, id, now),
    curve: row === undefined ? null : ExerciseCurve(database, id, row, now),
    strength: ExerciseStrength.series(database, id, now),
    lift: LiftTrends(database, Fixture.earlier, now).find((lift) => lift.id === id) ?? null,
  };
}

async function expectFresh(): Promise<void> {
  const fresh = await Database.fromBytes(db.exportBytes());
  try {
    for (const id of Fixture.ids) {
      for (const now of [Fixture.now, Fixture.earlier]) {
        expect(read(db, id, now)).toEqual(read(fresh, id, now));
        fresh.cache.clear();
      }
    }
    expect(strengthIndexReport(db, Fixture.earlier, Fixture.now)).toEqual(
      strengthIndexReport(fresh, Fixture.earlier, Fixture.now),
    );
  } finally {
    fresh.close();
  }
}

interface Mutation {
  readonly name: string;
  readonly sql: string;
  readonly changed: readonly number[];
}

const mutations: readonly Mutation[] = [
  {
    name: 'logging a set',
    sql: `
      INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps)
      VALUES (1, 4, 'working', 80, 'kg', 6)
    `,
    changed: [1],
  },
  { name: 'editing a set', sql: 'UPDATE workoutSet SET reps = 12 WHERE id = 1', changed: [1] },
  { name: 'deleting a set', sql: 'DELETE FROM workoutSet WHERE id = 1', changed: [1] },
  {
    name: 'moving a set between exercises',
    sql: 'UPDATE workoutSet SET workoutExerciseId = 2, position = 5 WHERE id = 1',
    changed: [1, 2],
  },
  {
    name: 'replacing a set owned by another exercise',
    sql: `
      INSERT OR REPLACE INTO workoutSet
        (id, workoutExerciseId, position, kind, weightKilograms, entryUnit, reps)
      VALUES (1, 2, 5, 'working', 70, 'kg', 8)
    `,
    changed: [1, 2],
  },
  {
    name: 'adding an exercise to a workout',
    sql: 'INSERT INTO workoutExercise (workoutId, exerciseId, position) VALUES (1, 4, 2)',
    changed: [4],
  },
  {
    name: 'removing an exercise and cascading its sets',
    sql: 'DELETE FROM workoutExercise WHERE id = 1',
    changed: [1],
  },
  { name: 'reordering an exercise', sql: 'UPDATE workoutExercise SET position = 5 WHERE id = 1', changed: [1] },
  { name: 'reassigning an exercise', sql: 'UPDATE workoutExercise SET exerciseId = 3 WHERE id = 1', changed: [1, 3] },
  {
    name: 'moving an entry between workouts',
    sql: 'UPDATE workoutExercise SET workoutId = 2, position = 2 WHERE id = 1',
    changed: [1],
  },
  {
    name: 'changing a workout date',
    sql: "UPDATE workout SET startedAt = '2026-10-10T10:00:00.000Z' WHERE id = 1",
    changed: [1, 2],
  },
  {
    name: 'changing the newest date into the future',
    sql: "UPDATE workout SET startedAt = '2026-12-01T10:00:00.000Z' WHERE id = 6",
    changed: [3],
  },
  { name: 'editing workout notes', sql: "UPDATE workout SET notes = 'Edited' WHERE id = 1", changed: [1, 2] },
  {
    name: 'finishing a workout',
    sql: "UPDATE workout SET endedAt = '2026-10-01T12:00:00.000Z', isInProgress = 0 WHERE id = 1",
    changed: [1, 2],
  },
  { name: 'reopening a workout', sql: 'UPDATE workout SET isInProgress = 1 WHERE id = 1', changed: [1, 2] },
  {
    name: 'changing workout template membership',
    sql: 'UPDATE workout SET templateId = 2 WHERE id = 1',
    changed: [1, 2],
  },
  { name: 'deleting a workout and its children', sql: 'DELETE FROM workout WHERE id = 1', changed: [1, 2] },
  { name: 'editing equipment', sql: "UPDATE exercise SET equipment = 'dumbbell' WHERE id = 1", changed: [1] },
  {
    name: 'editing mechanic and load step',
    sql: "UPDATE exercise SET mechanic = 'compound', loadStepKilograms = 5 WHERE id = 1",
    changed: [1],
  },
  { name: 'editing tracking', sql: "UPDATE exercise SET tracking = 'duration' WHERE id = 1", changed: [1] },
  { name: 'deleting an exercise', sql: 'DELETE FROM exercise WHERE id = 4', changed: [4] },
  { name: 'inserting muscles', sql: "INSERT INTO exerciseMuscle VALUES (2, 'chest', 'primary')", changed: [2] },
  { name: 'editing muscles', sql: "UPDATE exerciseMuscle SET role = 'secondary' WHERE exerciseId = 1", changed: [1] },
  { name: 'moving muscles', sql: 'UPDATE exerciseMuscle SET exerciseId = 2 WHERE exerciseId = 1', changed: [1, 2] },
  { name: 'deleting muscles', sql: 'DELETE FROM exerciseMuscle WHERE exerciseId = 1', changed: [1] },
  { name: 'writing settings', sql: "INSERT INTO appSetting VALUES ('test', 'true')", changed: [] },
  { name: 'pinning a lift', sql: "INSERT INTO pinnedExercise VALUES (1, 0, '2026-11-02')", changed: [] },
  {
    name: 'writing an untracked table',
    sql: "INSERT INTO exerciseAlias (exerciseId, alias) VALUES (1, 'zz test')",
    changed: Fixture.ids,
  },
  { name: 'a write with no tracked rows', sql: 'UPDATE workoutSet SET reps = 9 WHERE id = -1', changed: [] },
];

describe('per-exercise invalidation', () => {
  test.each(mutations)(
    '$name advances exactly the expected revisions and equals fresh queries',
    async ({ sql, changed }) => {
      const versions = Fixture.ids.map((id) => db.exerciseVersion(id));
      const before = Fixture.ids.map((id) => read(db, id));
      db.transaction(() => db.run(sql));
      for (const [index, id] of Fixture.ids.entries()) {
        if (changed.includes(id)) expect(db.exerciseVersion(id)).toBeGreaterThan(versions[index] ?? -1);
        else {
          expect(db.exerciseVersion(id)).toBe(versions[index]);
          expect(read(db, id).series).toBe(before[index]?.series);
          expect(read(db, id).page).toBe(before[index]?.page);
        }
      }
      await expectFresh();
    },
  );

  test('a real finish preserves untouched lifts after an in-progress history was cached', async () => {
    db.run('UPDATE workout SET isInProgress = 1, endedAt = NULL WHERE id = 1');
    const before = Fixture.ids.map((id) => read(db, id));
    db.transaction(() =>
      db.run("UPDATE workout SET isInProgress = 0, endedAt = '2026-10-01T12:00:00.000Z' WHERE id = 1"),
    );
    expect(read(db, 1).all).not.toBe(before[0]?.all);
    expect(read(db, 3).all).toBe(before[2]?.all);
    await expectFresh();
  });

  test('rolled-back writes discard results read inside outer and nested transactions', async () => {
    for (const id of Fixture.ids) read(db, id);
    db.transaction(() => {
      db.run('UPDATE workoutSet SET reps = 9 WHERE id = 1');
      expect(() =>
        db.transaction(() => {
          db.run('UPDATE workoutSet SET reps = 14 WHERE id = 1');
          expect(read(db, 1).all[0]?.sets[0]?.reps).toBe(14);
          throw new Error('inner undo');
        }),
      ).toThrow('inner undo');
      expect(read(db, 1).all[0]?.sets[0]?.reps).toBe(9);
    });
    const versions = Fixture.ids.map((id) => db.exerciseVersion(id));
    expect(() =>
      db.transaction(() => {
        db.run('UPDATE workoutSet SET reps = 19 WHERE id = 1');
        read(db, 1);
        throw new Error('outer undo');
      }),
    ).toThrow('outer undo');
    for (const [index, id] of Fixture.ids.entries())
      expect(db.exerciseVersion(id)).toBeGreaterThan(versions[index] ?? -1);
    await expectFresh();
  });

  test('merging exercises falls back for alias, pin and template writes', async () => {
    const versions = Fixture.ids.map((id) => db.exerciseVersion(id));
    Fixture.ids.forEach((id) => read(db, id));
    ExerciseEditor.merge(db, 1, 2);
    for (const [index, id] of Fixture.ids.entries())
      expect(db.exerciseVersion(id)).toBeGreaterThan(versions[index] ?? -1);
    await expectFresh();
  });

  test('imports invalidate all lifts, even when matching existing exercise names', async () => {
    const rows = parseStrongWorkoutsFile(OLDER_LAYOUT);
    for (const [index, name] of [...new Set(rows.map((row) => row.exerciseName))].entries()) {
      db.run('UPDATE exercise SET name = ? WHERE id = ?', [name, index + 1]);
    }
    Fixture.ids.forEach((id) => read(db, id));
    const versions = Fixture.ids.map((id) => db.exerciseVersion(id));
    importStrongPlan(db, makeStrongImportPlan(rows, []), Fixture.now);
    for (const [index, id] of Fixture.ids.entries())
      expect(db.exerciseVersion(id)).toBeGreaterThan(versions[index] ?? -1);
    await expectFresh();
  });

  test('restore starts with an empty cache and installs TEMP triggers on the restored connection', async () => {
    const bytes = db.exportBytes();
    const original = read(db, 1);
    db.run('UPDATE workoutSet SET reps = 15 WHERE id = 1');
    read(db, 1);
    const restored = await Database.fromBytes(bytes);
    try {
      expect(restored.cache.statistics().entries).toBe(0);
      expect(read(restored, 1)).toEqual(original);
      const version = restored.exerciseVersion(1);
      restored.run('UPDATE workoutSet SET reps = 16 WHERE id = 1');
      expect(restored.exerciseVersion(1)).toBeGreaterThan(version);
      expect(read(restored, 1)).not.toEqual(original);
      expect(
        restored.all(
          "SELECT name FROM main.sqlite_schema WHERE name LIKE 'changedExercise%' OR name LIKE 'trackExercise_%'",
        ),
      ).toEqual([]);
    } finally {
      restored.close();
    }
  });

  test('migrations and trigger-free bulk scripts invalidate all and tracking resumes', async () => {
    Fixture.ids.forEach((id) => read(db, id));
    const versions = Fixture.ids.map((id) => db.exerciseVersion(id));
    migrate(db, Fixture.now, [
      ...MIGRATIONS,
      { id: 'cache-test', sql: 'ALTER TABLE exercise ADD COLUMN synthetic TEXT' },
    ]);
    for (const [index, id] of Fixture.ids.entries())
      expect(db.exerciseVersion(id)).toBeGreaterThan(versions[index] ?? -1);
    await expectFresh();
    const afterMigration = db.exerciseVersion(3);
    db.run('UPDATE workoutSet SET reps = 11 WHERE id = 1');
    expect(db.exerciseVersion(3)).toBe(afterMigration);
    db.exec('DROP TRIGGER temp.trackExercise_workoutSet_UPDATE; UPDATE workoutSet SET reps = 12 WHERE id = 1');
    await expectFresh();
    const untouched = db.exerciseVersion(3);
    db.run('UPDATE workoutSet SET reps = 13 WHERE id = 1');
    expect(db.exerciseVersion(3)).toBe(untouched);
    await expectFresh();
  });

  test('rolled-back schema changes rebuild tracking before the next write', async () => {
    Fixture.ids.forEach((id) => read(db, id));
    expect(() =>
      db.transaction(() => {
        db.exec('CREATE TABLE syntheticChange (value TEXT)');
        db.run('UPDATE workoutSet SET reps = 20 WHERE id = 1');
        read(db, 1);
        throw new Error('undo schema');
      }),
    ).toThrow('undo schema');
    await expectFresh();
    const untouched = db.exerciseVersion(3);
    db.run('UPDATE workoutSet SET reps = 14 WHERE id = 1');
    expect(db.exerciseVersion(3)).toBe(untouched);
    await expectFresh();
  });

  test('clock keys preserve identical history but refresh day-dependent strength', () => {
    const before = read(db, 1);
    const nextDay = read(db, 1, new Date('2026-11-03T12:00:00.000Z'));
    expect(nextDay.all).toBe(before.all);
    expect(nextDay.series).toBe(before.series);
    expect(nextDay.curve).toBe(before.curve);
    expect(nextDay.strength).not.toBe(before.strength);
    expect(read(db, 1, Fixture.earlier).all).not.toEqual(before.all);
  });

  test('changing the time zone on the same local day refreshes civil-date strength', async () => {
    vi.stubEnv('TZ', 'UTC');
    const before = read(db, 1);
    vi.stubEnv('TZ', 'Pacific/Honolulu');
    const after = read(db, 1);
    expect(after.strength).not.toBe(before.strength);
    expect(after.all).toBe(before.all);
    await expectFresh();
  });

  test('overflow invalidates all and bounds the tracking table', async () => {
    for (let id = 5; id <= ExerciseChangeLimits.exercises + 1; id += 1) {
      db.run("INSERT INTO exercise (id, name, source, createdAt) VALUES (?, ?, 'custom', ?)", [
        id,
        `Extra ${id}`,
        Fixture.now.toISOString(),
      ]);
    }
    const before = db.exerciseVersion(-1);
    db.run('UPDATE exercise SET isArchived = 1');
    expect(db.exerciseVersion(-1)).toBeGreaterThan(before);
    expect(db.value<number>('SELECT count(*) FROM temp.changedExercise')).toBe(0);
    await expectFresh();
  });

  test('failed writes invalidate all and leave subsequent scoped writes safe', async () => {
    Fixture.ids.forEach((id) => read(db, id));
    const before = db.exerciseVersion(3);
    expect(() => db.run('UPDATE workoutSet SET workoutExerciseId = -1 WHERE id = 1')).toThrow();
    expect(db.exerciseVersion(3)).toBeGreaterThan(before);
    db.run('UPDATE workoutSet SET reps = 12 WHERE id = 1');
    await expectFresh();
  });

  test('seeded random writes always equal a separate fresh connection', async () => {
    let state = Fixture.randomSeed;
    for (let step = 0; step < Fixture.randomSteps; step += 1) {
      Fixture.ids.forEach((id) => read(db, id));
      state = (state * Fixture.randomMultiplier) % Fixture.randomModulus;
      const id = (state % 3) + 1;
      switch (state % 8) {
        case 0:
          db.run(
            'UPDATE workoutSet SET reps = ?, rpe = ? WHERE workoutExerciseId IN (SELECT id FROM workoutExercise WHERE exerciseId = ?)',
            [5 + (state % 10), 8 + (state % 3), id],
          );
          break;
        case 1:
          db.run('UPDATE workoutExercise SET exerciseId = ? WHERE id = ?', [id, (state % 9) + 1]);
          break;
        case 2:
          db.run('UPDATE workout SET startedAt = ? WHERE id = ?', [
            `2026-10-${String(10 + (state % 20))}T10:00:00.000Z`,
            (state % 6) + 1,
          ]);
          break;
        case 3:
          db.run('UPDATE exercise SET equipment = ? WHERE id = ?', [state % 2 === 0 ? 'barbell' : 'dumbbell', id]);
          break;
        case 4:
          db.run('DELETE FROM workoutSet WHERE id = ?', [(state % 36) + 1]);
          break;
        case 5:
          db.run("INSERT OR REPLACE INTO exerciseMuscle VALUES (?, 'chest', 'primary')", [id]);
          break;
        case 6:
          expect(() =>
            db.transaction(() => {
              db.run('UPDATE workoutSet SET weightKilograms = ? WHERE id = 1', [state % 100]);
              read(db, 1);
              throw new Error('random undo');
            }),
          ).toThrow('random undo');
          break;
        case 7:
          db.run("INSERT OR REPLACE INTO appSetting VALUES ('random', ?)", [String(state)]);
      }
      await expectFresh();
    }
  });
});
