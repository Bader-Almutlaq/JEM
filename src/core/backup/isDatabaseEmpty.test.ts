import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { ExerciseLibrary } from '../library/ExerciseLibrary';
import { ExerciseLibrarySeeder } from '../library/ExerciseLibrarySeeder';
import { isDatabaseEmpty } from './isDatabaseEmpty';

let database: Database;
beforeEach(async () => {
  database = await Database.openInMemory();
  migrate(database);
});
afterEach(() => database.close());

describe('isDatabaseEmpty', () => {
  test('seeded library, sites and settings alone are empty', () => {
    ExerciseLibrarySeeder.seed(database, ExerciseLibrary.bundled(), new Date());
    database.run(`INSERT INTO appSetting (key, value) VALUES ('appearance', 'dark')`);
    expect(isDatabaseEmpty(database)).toBe(true);
  });

  test.each([
    [
      'finished workout',
      `INSERT INTO workout (startedAt, endedAt, name, source) VALUES ('2026-11-02', '2026-11-02', 'Synthetic', 'app')`,
    ],
    [
      'unfinished workout',
      `INSERT INTO workout (startedAt, name, source, isInProgress) VALUES ('2026-11-02', 'Synthetic', 'app', 1)`,
    ],
    [
      'saved workout',
      `INSERT INTO template (name, position, createdAt, updatedAt) VALUES ('Synthetic', 0, '2026-11-02', '2026-11-02')`,
    ],
    ['plan', `INSERT INTO templateFolder (name, position) VALUES ('Synthetic', 0)`],
    [
      'measurement',
      `INSERT INTO bodyMeasurement (takenAt, site, value, source) VALUES ('2026-11-02', 'waist', 90, 'app')`,
    ],
    [
      'bodyweight',
      `INSERT INTO bodyMeasurement (takenAt, site, value, source) VALUES ('2026-11-02', 'bodyweight', 80, 'app')`,
    ],
    ['custom exercise', `INSERT INTO exercise (name, source, createdAt) VALUES ('Synthetic', 'custom', '2026-11-02')`],
    [
      'archived custom exercise',
      `INSERT INTO exercise (name, source, createdAt, isArchived) VALUES ('Synthetic', 'custom', '2026-11-02', 1)`,
    ],
    [
      'imported exercise',
      `INSERT INTO exercise (name, source, createdAt) VALUES ('Synthetic', 'strong', '2026-11-02')`,
    ],
    [
      'custom body part',
      `INSERT INTO measurementSite (key, name, kind, groupKey, supportsFlexed, guide, position, isCustom) VALUES ('synthetic', 'Synthetic', 'length', 'synthetic', 0, '', 99, 1)`,
    ],
  ])('%s alone counts as data', (_label, sql) => {
    database.run(sql);
    expect(isDatabaseEmpty(database)).toBe(false);
  });

  test('returns to empty after the last data is deleted', () => {
    database.run(`INSERT INTO workout (startedAt, name, source) VALUES ('2026-11-02', 'Synthetic', 'app')`);
    database.run(`DELETE FROM workout`);
    expect(isDatabaseEmpty(database)).toBe(true);
  });
});
