import type { Database, SqlValue } from '../Database';

/** Synthetic records covering every persisted table and optional field; never uses owner data. */
export const DataSafetyFixture = {
  /** Populates a migrated database with linked history, an active workout, templates and settings. */
  seed(db: Database): void {
    db.exec(`
      INSERT INTO exercise
        (id, name, equipment, movementPattern, mechanic, source, libraryKey, isLengthenedBiased,
         tracking, defaultEntryUnit, isArchived, createdAt, restTargetSeconds)
      VALUES
        (1, 'Custom α', 'cable', 'pull', 'isolation', 'custom', NULL, 1,
         'weight-duration', 'lb', 0, '2026-01-01T00:00:00.123Z', 135),
        (2, 'Merged target', NULL, NULL, NULL, 'strong', NULL, 0,
         'weight-reps', 'kg', 1, '2026-02-01T00:00:00.000Z', NULL);
      INSERT INTO exerciseMuscle VALUES (1, 'biceps', 'primary'), (1, 'upper-traps', 'secondary');
      INSERT INTO exerciseAlias VALUES ('Old merged name', 2), ('Alternate α', 1);
      INSERT INTO templateFolder VALUES (1, 'Folder α', 0);
      INSERT INTO template
        (id, name, folderId, position, notes, createdAt, updatedAt, lastStartedAt)
      VALUES (1, 'Plan α', 1, 0, 'Plan\nnotes', 'a', 'b', 'c');
      INSERT INTO templateExercise (id, templateId, exerciseId, position, supersetGroup, notes)
      VALUES (1, 1, 1, 0, 7, 'Exercise notes');
      INSERT INTO templateSet (id, templateExerciseId, position, kind, targetRepsLow, targetRepsHigh, targetRpe)
      VALUES (1, 1, 0, 'drop', 4, 7, 8.5);
      INSERT INTO workout
        (id, startedAt, endedAt, name, notes, source, sourceKey, isInProgress, templateId)
      VALUES
        (1, '2026-10-01T10:00:00.123Z', '2026-10-01T11:00:00.456Z', 'History α',
         'Workout\nnotes', 'strong', 'strong:synthetic', 0, 1),
        (2, '2026-10-02T10:00:00.000Z', NULL, 'Active', NULL, 'app', NULL, 1, NULL);
      INSERT INTO workoutExercise (id, workoutId, exerciseId, position, supersetGroup, notes) VALUES (1, 1, 1, 0, 5, 'Entry α'), (2, 2, 2, 0, NULL, NULL);
      INSERT INTO workoutSet
        (id, workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe,
         durationSeconds, distanceMeters, side, restBeforeSeconds, completedAt, isCompleted, notes)
      VALUES
        (1, 1, 0, 'failure', 61.234970000000004, 'lb', 7, 8.5, 65.25, 123.75,
         'left', 150.125, '2026-10-01T10:02:00.789Z', 1, 'Set\nα'),
        (2, 2, 0, 'warmup', 0, 'kg', 0, NULL, NULL, NULL, 'right', NULL, NULL, 0, NULL),
        (3, 1, 1, 'working', 42.125, 'kg', 9, 10, NULL, NULL, 'both', NULL, NULL, 1, ''),
        (4, 1, 2, 'drop', 20.25, 'kg', 12, 9, 0, 0, 'both', 0, NULL, 1, NULL);
      INSERT INTO bodyMeasurement (id, takenAt, site, value, source) VALUES
        (1, '2026-01-01T10:00:00.000Z', 'waist', 83.125, 'strong'),
        (2, '2026-01-02T10:00:00.000Z', 'bodyweight', 81.2345, 'app');
      INSERT INTO appSetting VALUES ('custom-setting', 'α\n{"enabled":true}');
    `);
  },
  /** All columns of every user table, including migration records and SQLite's id sequences. */
  read(db: Database): Record<string, Record<string, SqlValue>[]> {
    const result: Record<string, Record<string, SqlValue>[]> = {};
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    for (const { name } of tables) {
      // Identifiers come from SQLite's schema; quoting also handles unusual names in damaged backups.
      const identifier = `"${name.replaceAll('"', '""')}"`;
      result[name] = db.all<Record<string, SqlValue>>(`SELECT * FROM ${identifier} ORDER BY rowid`);
    }
    return result;
  },
};
