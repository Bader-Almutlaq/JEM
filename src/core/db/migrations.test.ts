import { expect, test } from 'vitest';
import { Database } from './Database';
import { ExerciseLibrary } from '../library/ExerciseLibrary';
import { DataSafetyFixture } from './fixtures/DataSafetyFixture';
import { validateBackup } from '../backup/BackupValidation';
import { MIGRATIONS, migrate } from './migrations';

test('v4 → v5 preserves every existing row and column and initializes nullable loading settings', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date('2026-01-01'), MIGRATIONS.slice(0, 4));
    DataSafetyFixture.seed(db);
    const before = DataSafetyFixture.read(db);
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 5))).toEqual(['v5-exercise-load-settings']);
    const after = DataSafetyFixture.read(db);
    for (const [table, records] of Object.entries(before)) {
      if (table === 'migration') continue;
      expect(
        after[table]?.map((row) => Object.fromEntries(Object.keys(records[0] ?? {}).map((key) => [key, row[key]]))),
      ).toEqual(records);
    }
    expect(db.all('SELECT loadStepKilograms, barWeightKilograms, warmupSetCount FROM exercise')).toEqual([
      { loadStepKilograms: null, barWeightKilograms: null, warmupSetCount: null },
      { loadStepKilograms: null, barWeightKilograms: null, warmupSetCount: null },
    ]);
    const bytes = db.exportBytes();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 5))).toEqual([]);
    expect(db.exportBytes()).toEqual(bytes);
    expect(() => db.run('UPDATE exercise SET warmupSetCount = 5')).toThrow();
    expect(() => db.run('UPDATE exercise SET warmupSetCount = -1')).toThrow();
  } finally {
    db.close();
  }
});

test('v5 → v6 preserves every row and column, adds nullable details and frozen muscles, and validates backups', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date('2026-01-01'), MIGRATIONS.slice(0, 5));
    DataSafetyFixture.seed(db);
    db.run('UPDATE exercise SET loadStepKilograms = 1.25, barWeightKilograms = 15, warmupSetCount = 3');
    const before = DataSafetyFixture.read(db);
    const oldBytes = db.exportBytes();
    await expect(validateBackup(oldBytes)).resolves.toBeUndefined();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 6))).toEqual(['v6-library-details']);
    const after = DataSafetyFixture.read(db);
    for (const [table, records] of Object.entries(before)) {
      if (table === 'migration') continue;
      expect(
        after[table]
          ?.slice(0, records.length)
          .map((row) => Object.fromEntries(Object.keys(records[0] ?? {}).map((key) => [key, row[key]]))),
      ).toEqual(records);
    }
    expect(db.all('SELECT instructions, imageKeys FROM exercise')).toEqual([
      { instructions: null, imageKeys: null },
      { instructions: null, imageKeys: null },
    ]);
    expect(db.value('SELECT count(*) FROM muscle')).toBe(28);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 6))).toEqual([]);
  } finally {
    db.close();
  }
});

test('v7 → v8 preserves every row, defaults progression to NULL, and validates old/new backups', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date('2026-01-01'), MIGRATIONS.slice(0, 7));
    DataSafetyFixture.seed(db);
    const before = DataSafetyFixture.read(db);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 8))).toEqual(['v8-template-progression']);
    const after = DataSafetyFixture.read(db);
    for (const [table, records] of Object.entries(before)) {
      if (table === 'migration') continue;
      expect(
        after[table]?.map((row) => Object.fromEntries(Object.keys(records[0] ?? {}).map((key) => [key, row[key]]))),
      ).toEqual(records);
    }
    expect(db.all('SELECT progression FROM templateExercise')).toEqual([{ progression: null }]);
    expect(() => db.run("UPDATE templateExercise SET progression = 'automatic'")).toThrow();
    db.run("UPDATE templateExercise SET progression = 'double'");
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 8))).toEqual([]);
  } finally {
    db.close();
  }
});

test('v8 → v9 preserves every row, defaults deload to NULL, constrains stages and validates backups', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date('2026-01-01'), MIGRATIONS.slice(0, 8));
    DataSafetyFixture.seed(db);
    const before = DataSafetyFixture.read(db);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 9))).toEqual(['v9-deload']);
    const after = DataSafetyFixture.read(db);
    for (const [table, records] of Object.entries(before)) {
      if (table === 'migration') continue;
      expect(
        after[table]?.map((row) => Object.fromEntries(Object.keys(records[0] ?? {}).map((key) => [key, row[key]]))),
      ).toEqual(records);
    }
    expect(db.all('SELECT deloadStage FROM workoutExercise')).toEqual([{ deloadStage: null }, { deloadStage: null }]);
    for (const invalid of [0, 3, -1, 1.5, 'invalid']) {
      expect(() => db.run('UPDATE workoutExercise SET deloadStage = ?', [invalid])).toThrow();
    }
    for (const stage of [1, 2, null]) {
      db.run('UPDATE workoutExercise SET deloadStage = ?', [stage]);
      await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    }
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    const bytes = db.exportBytes();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 9))).toEqual([]);
    expect(db.exportBytes()).toEqual(bytes);
  } finally {
    db.close();
  }
});

test('v9 → v10 preserves rows, defaults brands to NULL and validates backups', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date('2026-01-01'), MIGRATIONS.slice(0, 9));
    DataSafetyFixture.seed(db);
    const before = DataSafetyFixture.read(db);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 10))).toEqual(['v10-machine-brand']);
    const after = DataSafetyFixture.read(db);
    for (const [table, records] of Object.entries(before)) {
      if (table === 'migration') continue;
      expect(
        after[table]?.map((row) => Object.fromEntries(Object.keys(records[0] ?? {}).map((key) => [key, row[key]]))),
      ).toEqual(records);
    }
    expect(db.all('SELECT machineBrand FROM workoutExercise')).toEqual([
      { machineBrand: null },
      { machineBrand: null },
    ]);
    expect(db.all('SELECT machineBrand FROM templateExercise')).toEqual([{ machineBrand: null }]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
  } finally {
    db.close();
  }
});

test('v10 to v11 preserves rows, defaults weekday to null, and validates backups', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date(), MIGRATIONS.slice(0, 10));
    DataSafetyFixture.seed(db);
    const before = DataSafetyFixture.read(db);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 11))).toEqual(['v11-template-weekday']);
    const after = DataSafetyFixture.read(db);
    for (const [table, records] of Object.entries(before)) {
      if (table === 'migration') continue;
      expect(
        after[table]?.map((row) => Object.fromEntries(Object.keys(records[0] ?? {}).map((key) => [key, row[key]]))),
      ).toEqual(records);
    }
    expect(db.all('SELECT weekday FROM template')).toEqual([{ weekday: null }]);
    expect(() => db.run('UPDATE template SET weekday = 8')).toThrow();
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
  } finally {
    db.close();
  }
});

test('v11 to v12 preserves stage and nullable settings through a backup', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date(), MIGRATIONS.slice(0, 11));
    DataSafetyFixture.seed(db);
    db.run('UPDATE workoutExercise SET deloadStage = 1');
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 12))).toEqual(['v12-deload-settings']);
    expect(db.all('SELECT deloadStage, deloadMode, deloadLoadPercent, deloadSetPercent FROM workoutExercise')).toEqual([
      { deloadStage: 1, deloadMode: null, deloadLoadPercent: null, deloadSetPercent: null },
      { deloadStage: 1, deloadMode: null, deloadLoadPercent: null, deloadSetPercent: null },
    ]);
    db.run("UPDATE workoutExercise SET deloadMode = 'both', deloadLoadPercent = 15, deloadSetPercent = 33");
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    const restored = await Database.fromBytes(db.exportBytes());
    try {
      expect(restored.all('SELECT deloadMode, deloadLoadPercent, deloadSetPercent FROM workoutExercise')).toEqual([
        { deloadMode: 'both', deloadLoadPercent: 15, deloadSetPercent: 33 },
        { deloadMode: 'both', deloadLoadPercent: 15, deloadSetPercent: 33 },
      ]);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
  }
});

test('v12 to v13 changes only the original library exercise and preserves its sets', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date(), MIGRATIONS.slice(0, 12));
    DataSafetyFixture.seed(db);
    db.exec(`
      UPDATE exercise SET name = 'Donkey Calf Raise', source = 'library', libraryKey = 'donkey-calf-raise', tracking = 'bodyweight-reps' WHERE id = 1;
      UPDATE exercise SET name = 'Renamed calf', source = 'custom', tracking = 'bodyweight-reps' WHERE id = 2;
      UPDATE workoutSet SET weightKilograms = 145 WHERE workoutExerciseId = 1;
    `);
    const sets = db.all('SELECT * FROM workoutSet');
    expect(migrate(db)).toEqual([
      'v13-donkey-calf-raise-weighted',
      'v14-pinned-exercises',
      'v15-lower-traps',
      'v16-target-ranges',
    ]);
    expect(db.all('SELECT tracking, loadStepKilograms FROM exercise ORDER BY id')).toEqual([
      { tracking: 'weight-reps', loadStepKilograms: 2.5 },
      { tracking: 'bodyweight-reps', loadStepKilograms: null },
    ]);
    expect(db.all('SELECT * FROM workoutSet')).toEqual(sets);
    expect(migrate(db)).toEqual([]);
  } finally {
    db.close();
  }
  const renamed = await Database.openInMemory();
  try {
    migrate(renamed, new Date(), MIGRATIONS.slice(0, 12));
    renamed.run(
      "INSERT INTO exercise (name, source, libraryKey, tracking, createdAt) VALUES ('Renamed calf', 'library', 'donkey-calf-raise', 'bodyweight-reps', 'a')",
    );
    migrate(renamed);
    expect(renamed.value('SELECT tracking FROM exercise')).toBe('bodyweight-reps');
  } finally {
    renamed.close();
  }
  const fresh = await Database.openInMemory();
  try {
    expect(migrate(fresh)).toContain('v13-donkey-calf-raise-weighted');
  } finally {
    fresh.close();
  }
});

test('v14 to v15 tags only the frozen library families, preserves custom/edited muscles, and is idempotent', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date(), MIGRATIONS.slice(0, 14));
    DataSafetyFixture.seed(db);
    const targets = ExerciseLibrary.bundled().exercises.filter((exercise) =>
      exercise.secondaryMuscles.includes('lower-traps'),
    );
    expect(targets).toHaveLength(10);
    const ids = targets.map((exercise, index) => {
      const source = index === 0 ? 'custom' : index === 1 ? 'strong' : 'library';
      const id = db.run(
        `
        INSERT INTO exercise (name, libraryKey, source, createdAt) VALUES (?, ?, ?, '2026-01-01')
      `,
        [exercise.name, exercise.key, source],
      ).lastInsertRowId;
      db.run(`INSERT INTO exerciseMuscle (exerciseId, muscleId, role) VALUES (?, 'rear-delt', 'primary')`, [id]);
      return { id, source };
    });
    // INSERT OR IGNORE must preserve an existing owner-selected role too.
    const existing = ids[2];
    if (existing === undefined) throw new Error('Missing target fixture');
    db.run(`INSERT INTO exerciseMuscle (exerciseId, muscleId, role) VALUES (?, 'lower-traps', 'primary')`, [
      existing.id,
    ]);
    const before = DataSafetyFixture.read(db);
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 15))).toEqual(['v15-lower-traps']);
    const after = DataSafetyFixture.read(db);
    for (const [table, rows] of Object.entries(before)) {
      if (table !== 'migration' && table !== 'exerciseMuscle') expect(after[table]).toEqual(rows);
    }
    for (const { id, source } of ids) {
      expect(db.all(`SELECT muscleId, role FROM exerciseMuscle WHERE exerciseId = ? ORDER BY muscleId`, [id])).toEqual(
        source !== 'library'
          ? [{ muscleId: 'rear-delt', role: 'primary' }]
          : [
              { muscleId: 'lower-traps', role: id === existing.id ? 'primary' : 'secondary' },
              { muscleId: 'rear-delt', role: 'primary' },
            ],
      );
    }
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    await expect(validateBackup(db.exportBytes())).resolves.toBeUndefined();
    const bytes = db.exportBytes();
    expect(migrate(db, new Date(), MIGRATIONS.slice(0, 15))).toEqual([]);
    expect(db.exportBytes()).toEqual(bytes);
  } finally {
    db.close();
  }
});

test('v15 to v16 preserves existing rows and adds empty range ends', async () => {
  const db = await Database.openInMemory();
  try {
    migrate(db, new Date(), MIGRATIONS.slice(0, 15));
    DataSafetyFixture.seed(db);
    const beforeSet = db.get('SELECT id, kind, targetRpe FROM templateSet');
    const beforeExercise = db.get('SELECT id, restTargetSeconds FROM exercise WHERE id = 1');
    expect(migrate(db)).toEqual(['v16-target-ranges']);
    expect(db.get('SELECT id, kind, targetRpe FROM templateSet')).toEqual(beforeSet);
    expect(db.get('SELECT id, restTargetSeconds FROM exercise WHERE id = 1')).toEqual(beforeExercise);
    expect(db.value('SELECT targetRpeHigh FROM templateSet')).toBeNull();
    expect(db.value('SELECT restMaxSeconds FROM exercise WHERE id = 1')).toBeNull();
  } finally {
    db.close();
  }
});
