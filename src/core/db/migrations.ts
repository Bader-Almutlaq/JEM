import type { Database } from './Database';
import { DatabaseError } from './DatabaseError';

/** One schema change. `sql` runs once, inside a transaction, in list order. */
export interface Migration {
  /** Stable identifier, recorded in the `migration` table once applied. Never rename one. */
  readonly id: string;
  readonly sql: string;
}

/**
 * The database schema, as an ordered list of migrations.
 *
 * Rules (see `AGENTS.md`):
 * - **Append-only.** Never edit a migration that has shipped; add a new one.
 * - Reference data (muscle rows) is written out inside the migration, frozen, so a migration gives
 *   the same result forever. A test checks the rows match `MUSCLES`.
 * - Column names are camelCase, matching the TypeScript row types.
 * - Weights are kilograms (`REAL`), exactly as entered. Timestamps are UTC ISO 8601 text
 *   (`2026-10-30T13:05:00.000Z`), which sorts correctly as text. Booleans are 0/1 integers.
 * - Effort is stored once, as RPE (1–10, half steps allowed). RIR is derived as 10 − RPE
 *   (Zourdos 2016), so the two can never disagree.
 *
 * `v1-schema` is the native app's three migrations folded into one: no data ever reached a phone
 * from the native app, so there was nothing to migrate (see `docs/DECISIONS.md`).
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 'v1-schema',
    sql: `
      CREATE TABLE muscle (
        id TEXT PRIMARY KEY,                 -- stable slug, e.g. 'rear-delt'
        name TEXT NOT NULL,
        region TEXT NOT NULL                 -- chest, shoulders, back, arms, core, legs, neck
      );

      CREATE TABLE exercise (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        equipment TEXT,
        movementPattern TEXT,
        mechanic TEXT CHECK (mechanic IN ('compound', 'isolation')),
        source TEXT NOT NULL CHECK (source IN ('library', 'custom', 'strong')),
        libraryKey TEXT UNIQUE,              -- the library entry this row mirrors; NULL for custom and unmatched Strong rows
        isLengthenedBiased INTEGER NOT NULL DEFAULT 0 CHECK (isLengthenedBiased IN (0, 1)),
        tracking TEXT NOT NULL DEFAULT 'weight-reps'
          CHECK (tracking IN ('weight-reps', 'bodyweight-reps', 'duration', 'weight-duration')),
        defaultEntryUnit TEXT NOT NULL DEFAULT 'kg' CHECK (defaultEntryUnit IN ('kg', 'lb')),
        isArchived INTEGER NOT NULL DEFAULT 0 CHECK (isArchived IN (0, 1)),
        createdAt TEXT NOT NULL
      );

      CREATE TABLE exerciseMuscle (
        exerciseId INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
        muscleId TEXT NOT NULL REFERENCES muscle(id) ON DELETE RESTRICT,
        role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
        PRIMARY KEY (exerciseId, muscleId)
      );

      -- Other names that resolve to an exercise. Merging a Strong exercise into a library one stores
      -- the Strong name here, so later imports and searches land on the same row.
      CREATE TABLE exerciseAlias (
        alias TEXT PRIMARY KEY COLLATE NOCASE,
        exerciseId INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE
      );

      CREATE TABLE workout (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        name TEXT NOT NULL,
        notes TEXT,
        source TEXT NOT NULL CHECK (source IN ('app', 'strong')),
        sourceKey TEXT UNIQUE,               -- makes re-imports idempotent
        isInProgress INTEGER NOT NULL DEFAULT 0 CHECK (isInProgress IN (0, 1))
      );
      CREATE INDEX workout_startedAt ON workout(startedAt);
      -- At most one workout is being logged at a time.
      CREATE UNIQUE INDEX workout_single_in_progress ON workout(isInProgress) WHERE isInProgress = 1;

      CREATE TABLE workoutExercise (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workoutId INTEGER NOT NULL REFERENCES workout(id) ON DELETE CASCADE,
        exerciseId INTEGER NOT NULL REFERENCES exercise(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL,           -- 0-based order within the workout
        supersetGroup INTEGER,
        notes TEXT,
        UNIQUE (workoutId, position)
      );
      CREATE INDEX workoutExercise_exerciseId ON workoutExercise(exerciseId);

      CREATE TABLE workoutSet (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workoutExerciseId INTEGER NOT NULL REFERENCES workoutExercise(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,           -- 0-based order within the exercise
        kind TEXT NOT NULL CHECK (kind IN ('warmup', 'working', 'drop', 'failure')),
        weightKilograms REAL NOT NULL,
        entryUnit TEXT NOT NULL CHECK (entryUnit IN ('kg', 'lb')),
        reps INTEGER NOT NULL,
        rpe REAL,                            -- NULL = effort not logged
        durationSeconds REAL,
        distanceMeters REAL,
        side TEXT NOT NULL DEFAULT 'both' CHECK (side IN ('both', 'left', 'right')),
        restBeforeSeconds REAL,
        completedAt TEXT,
        isCompleted INTEGER NOT NULL DEFAULT 1 CHECK (isCompleted IN (0, 1)),
        notes TEXT,
        UNIQUE (workoutExerciseId, position)
      );

      CREATE TABLE bodyMeasurement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        takenAt TEXT NOT NULL,
        site TEXT NOT NULL,                  -- waist, left-bicep, bodyweight…
        value REAL NOT NULL,                 -- cm for circumferences, kg for bodyweight
        source TEXT NOT NULL CHECK (source IN ('app', 'strong')),
        UNIQUE (takenAt, site)
      );

      CREATE TABLE appSetting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT INTO muscle (id, name, region) VALUES
        ('chest', 'Chest', 'chest'),
        ('front-delt', 'Front delts', 'shoulders'),
        ('side-delt', 'Side delts', 'shoulders'),
        ('rear-delt', 'Rear delts', 'shoulders'),
        ('rotator-cuff', 'Rotator cuff', 'shoulders'),
        ('lats', 'Lats', 'back'),
        ('upper-back', 'Upper back', 'back'),
        ('upper-traps', 'Upper traps', 'back'),
        ('lower-back', 'Lower back', 'back'),
        ('biceps', 'Biceps', 'arms'),
        ('triceps', 'Triceps', 'arms'),
        ('forearm-flexors', 'Forearm flexors', 'arms'),
        ('forearm-extensors', 'Forearm extensors', 'arms'),
        ('abs', 'Abs', 'core'),
        ('obliques', 'Obliques', 'core'),
        ('hip-flexors', 'Hip flexors', 'core'),
        ('glutes', 'Glutes', 'legs'),
        ('hip-abductors', 'Hip abductors', 'legs'),
        ('adductors', 'Adductors', 'legs'),
        ('quads', 'Quads', 'legs'),
        ('hamstrings', 'Hamstrings', 'legs'),
        ('calves', 'Calves', 'legs'),
        ('neck', 'Neck', 'neck');
    `,
  },
  {
    // The rest the owner chose for an exercise's timer, in seconds. NULL = the app default
    // (RestTimerDefaults in src/core/logging). Remembered per exercise, like the entry unit.
    id: 'v2-exercise-rest-target',
    sql: `ALTER TABLE exercise ADD COLUMN restTargetSeconds INTEGER CHECK (restTargetSeconds IS NULL OR restTargetSeconds > 0);`,
  },
  {
    // Workout templates (W4). A template is the owner's plan: which exercises, in what order, how many
    // sets of which kind, and optional targets the owner writes (never suggested by the app).
    id: 'v3-templates',
    sql: `
      CREATE TABLE templateFolder (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        position INTEGER NOT NULL            -- 0-based order of folders
      );

      CREATE TABLE template (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        folderId INTEGER REFERENCES templateFolder(id) ON DELETE SET NULL,  -- NULL = not in a folder
        position INTEGER NOT NULL,           -- 0-based order within its folder (or among unfiled templates)
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastStartedAt TEXT                   -- when a workout was last started from it
      );
      CREATE INDEX template_folderId ON template(folderId);

      CREATE TABLE templateExercise (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        templateId INTEGER NOT NULL REFERENCES template(id) ON DELETE CASCADE,
        exerciseId INTEGER NOT NULL REFERENCES exercise(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL,           -- 0-based order within the template
        supersetGroup INTEGER,               -- same number = performed as a superset
        notes TEXT,
        UNIQUE (templateId, position)
      );
      CREATE INDEX templateExercise_exerciseId ON templateExercise(exerciseId);

      CREATE TABLE templateSet (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        templateExerciseId INTEGER NOT NULL REFERENCES templateExercise(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,           -- 0-based order within the exercise
        kind TEXT NOT NULL CHECK (kind IN ('warmup', 'working', 'drop', 'failure')),
        targetRepsLow INTEGER CHECK (targetRepsLow IS NULL OR targetRepsLow >= 0),
        targetRepsHigh INTEGER CHECK (targetRepsHigh IS NULL OR targetRepsHigh >= targetRepsLow),
        targetRpe REAL CHECK (targetRpe IS NULL OR (targetRpe >= 1 AND targetRpe <= 10)),
        UNIQUE (templateExerciseId, position)
      );

      ALTER TABLE workout ADD COLUMN templateId INTEGER REFERENCES template(id) ON DELETE SET NULL;
    `,
  },
  {
    id: 'v4-measurement-sites',
    sql: `
      CREATE TABLE measurementSite (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('length', 'mass')),
        groupKey TEXT NOT NULL,
        side TEXT CHECK (side IN ('left', 'right')),
        supportsFlexed INTEGER NOT NULL CHECK (supportsFlexed IN (0, 1)),
        guide TEXT NOT NULL,
        position INTEGER NOT NULL,
        isCustom INTEGER NOT NULL CHECK (isCustom IN (0, 1))
      );
      -- Frozen defaults are bookkeeping guides, not training recommendations.
      INSERT INTO measurementSite
        (key, name, kind, groupKey, side, supportsFlexed, guide, position, isCustom)
      VALUES
        ('bodyweight', 'Bodyweight', 'mass', 'bodyweight', NULL, 0, 'Use the same scale, at the same time of day, before eating.', 0, 0),
        ('chest', 'Chest', 'length', 'chest', NULL, 0, 'Chest: tape around the fullest part, level and snug, arms down, after a normal exhale.', 1, 0),
        ('shoulders', 'Shoulders', 'length', 'shoulders', NULL, 0, 'Shoulders: around the widest part of both shoulders, arms down and relaxed; keep the tape level.', 2, 0),
        ('neck', 'Neck', 'length', 'neck', NULL, 0, 'Neck: just below the larynx, head upright, tape snug without compressing the skin.', 3, 0),
        ('waist', 'Waist', 'length', 'waist', NULL, 0, 'Waist: at the belly button, tape level and snug, relaxed, after a normal exhale.', 4, 0),
        ('hips', 'Hips', 'length', 'hips', NULL, 0, 'Hips: around the widest part of the buttocks, feet together, tape level and snug.', 5, 0),
        ('upper-abs', 'Upper abs', 'length', 'upper-abs', NULL, 0, 'Upper abs: halfway between the belly button and the bottom of the breastbone, relaxed, after a normal exhale.', 6, 0),
        ('lower-abs', 'Lower abs', 'length', 'lower-abs', NULL, 0, 'Lower abs: halfway between the belly button and the pubic bone, tape level, relaxed, after a normal exhale.', 7, 0),
        ('left-bicep', 'Left bicep', 'length', 'biceps', 'left', 1, 'Biceps: at the peak, arm at 90 degrees; relaxed: release the muscle; flexed: clench the fist and contract the biceps hard.', 8, 0),
        ('right-bicep', 'Right bicep', 'length', 'biceps', 'right', 1, 'Biceps: at the peak, arm at 90 degrees; relaxed: release the muscle; flexed: clench the fist and contract the biceps hard.', 8, 0),
        ('left-forearm', 'Left forearm', 'length', 'forearms', 'left', 1, 'Forearms: at the widest part, arm straight; relaxed: open hand; flexed: clench the fist and contract the forearm.', 10, 0),
        ('right-forearm', 'Right forearm', 'length', 'forearms', 'right', 1, 'Forearms: at the widest part, arm straight; relaxed: open hand; flexed: clench the fist and contract the forearm.', 10, 0),
        ('left-thigh', 'Left thigh', 'length', 'thighs', 'left', 1, 'Thighs: at the widest part, standing; relaxed: release the thigh; flexed: contract it without moving the tape.', 12, 0),
        ('right-thigh', 'Right thigh', 'length', 'thighs', 'right', 1, 'Thighs: at the widest part, standing; relaxed: release the thigh; flexed: contract it without moving the tape.', 12, 0),
        ('left-calf', 'Left calf', 'length', 'calves', 'left', 1, 'Calves: at the widest part, standing; relaxed: release the calf; flexed: rise onto the toes and contract it.', 14, 0),
        ('right-calf', 'Right calf', 'length', 'calves', 'right', 1, 'Calves: at the widest part, standing; relaxed: release the calf; flexed: rise onto the toes and contract it.', 14, 0);

      INSERT INTO measurementSite
        (key, name, kind, groupKey, side, supportsFlexed, guide, position, isCustom)
      SELECT DISTINCT site, site, 'length', site, NULL, 0, '',
        (SELECT MAX(position) + 1 FROM measurementSite), 1
      FROM bodyMeasurement WHERE site NOT IN (SELECT key FROM measurementSite);

      -- Preserve the high-water mark even if the largest old id was deleted.
      CREATE TEMP TABLE measurementSequence AS
        SELECT seq FROM sqlite_sequence WHERE name = 'bodyMeasurement';
      CREATE TABLE bodyMeasurementV4 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        takenAt TEXT NOT NULL,
        site TEXT NOT NULL REFERENCES measurementSite(key),
        value REAL NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('app', 'strong')),
        state TEXT NOT NULL DEFAULT 'relaxed' CHECK (state IN ('relaxed', 'flexed')),
        entryUnit TEXT CHECK (entryUnit IN ('cm', 'in', 'kg', 'lb')),
        UNIQUE (takenAt, site, state)
      );
      INSERT INTO bodyMeasurementV4 (id, takenAt, site, value, source)
        SELECT id, takenAt, site, value, source FROM bodyMeasurement;
      DROP TABLE bodyMeasurement;
      ALTER TABLE bodyMeasurementV4 RENAME TO bodyMeasurement;
      UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM measurementSequence), 0))
        WHERE name = 'bodyMeasurement';
      DROP TABLE measurementSequence;
    `,
  },
  {
    id: 'v5-exercise-load-settings',
    sql: `
      ALTER TABLE exercise ADD COLUMN loadStepKilograms REAL;
      ALTER TABLE exercise ADD COLUMN barWeightKilograms REAL;
      ALTER TABLE exercise ADD COLUMN warmupSetCount INTEGER CHECK (warmupSetCount BETWEEN 0 AND 4);
    `,
  },
  {
    id: 'v6-library-details',
    sql: `
      ALTER TABLE exercise ADD COLUMN instructions TEXT;
      ALTER TABLE exercise ADD COLUMN imageKeys TEXT;
      -- Frozen taxonomy additions from T-047; existing muscle rows stay unchanged.
      INSERT INTO muscle (id, name, region) VALUES
        ('serratus', 'Serratus', 'chest'),
        ('brachialis', 'Brachialis', 'arms'),
        ('brachioradialis', 'Brachioradialis', 'arms'),
        ('tibialis', 'Tibialis', 'legs'),
        ('lower-traps', 'Lower traps', 'back');
    `,
  },
  {
    id: 'v7-measurement-ab-guides',
    sql: `
      -- Exact old defaults identify uncustomised guides; owner-written notes stay verbatim.
      UPDATE measurementSite
      SET guide = 'Lower abs: at the hip bone, tape level, relaxed, after a normal exhale.'
      WHERE key = 'lower-abs' AND isCustom = 0
        AND guide = 'Lower abs: halfway between the belly button and the pubic bone, tape level, relaxed, after a normal exhale.';
      UPDATE measurementSite
      SET guide = 'Waist: at the belly button, tape level and snug, relaxed, after a normal exhale.'
      WHERE key = 'waist' AND isCustom = 0
        AND guide = 'Waist: at the belly button, tape level and snug, relaxed, after a normal exhale.';
      UPDATE measurementSite
      SET guide = 'Upper abs: above the belly button, below the ribs, relaxed, after a normal exhale.'
      WHERE key = 'upper-abs' AND isCustom = 0
        AND guide = 'Upper abs: halfway between the belly button and the bottom of the breastbone, relaxed, after a normal exhale.';
    `,
  },
  {
    id: 'v8-template-progression',
    sql: `
      ALTER TABLE templateExercise ADD COLUMN progression TEXT CHECK (progression IN ('double'));
    `,
  },
  {
    id: 'v9-deload',
    sql: `
      ALTER TABLE workoutExercise ADD COLUMN deloadStage INTEGER CHECK (deloadStage IN (1, 2));
    `,
  },
  {
    id: 'v10-machine-brand',
    sql: `
      ALTER TABLE workoutExercise ADD COLUMN machineBrand TEXT;
      ALTER TABLE templateExercise ADD COLUMN machineBrand TEXT;
    `,
  },
  {
    id: 'v11-template-weekday',
    sql: `ALTER TABLE template ADD COLUMN weekday INTEGER CHECK (weekday BETWEEN 1 AND 7);`,
  },
  {
    id: 'v12-deload-settings',
    sql: `
      ALTER TABLE workoutExercise ADD COLUMN deloadMode TEXT CHECK (deloadMode IN ('load', 'sets', 'both'));
      ALTER TABLE workoutExercise ADD COLUMN deloadLoadPercent REAL CHECK (deloadLoadPercent > 0 AND deloadLoadPercent < 100);
      ALTER TABLE workoutExercise ADD COLUMN deloadSetPercent REAL CHECK (deloadSetPercent >= 0 AND deloadSetPercent < 100);
    `,
  },
  {
    id: 'v13-donkey-calf-raise-weighted',
    sql: `
      -- Heuristic: 2.5 kg is the plate-loaded step, so progression can suggest loads; editable under Loading.
      UPDATE exercise SET tracking = 'weight-reps', loadStepKilograms = COALESCE(loadStepKilograms, 2.5)
      WHERE libraryKey = 'donkey-calf-raise' AND name = 'Donkey Calf Raise'
        AND source = 'library' AND tracking = 'bodyweight-reps';
    `,
  },
  {
    id: 'v14-pinned-exercises',
    sql: `
      CREATE TABLE pinnedExercise (
        exerciseId INTEGER PRIMARY KEY REFERENCES exercise(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        pinnedAt TEXT NOT NULL
      );
    `,
  },
  {
    id: 'v15-lower-traps',
    sql: `
      -- Frozen direct lower-trap families; custom/edited exercise definitions keep their rows.
      INSERT OR IGNORE INTO exerciseMuscle (exerciseId, muscleId, role)
      SELECT id, 'lower-traps', 'secondary'
      FROM exercise
      WHERE source = 'library' AND libraryKey IN (
        'cross-body-y-raise-cable',
        'reverse-fly-dumbbell',
        'reverse-fly-cable',
        'reverse-fly-machine',
        'reverse-fly-band',
        'chest-supported-reverse-fly-dumbbell',
        'face-pull-cable',
        'face-pull-band',
        'reverse-fly-with-external-rotation-dumbbell',
        'sled-reverse-fly-weighted'
      );
    `,
  },
  {
    id: 'v16-target-ranges',
    sql: `
      ALTER TABLE templateSet ADD COLUMN targetRpeHigh REAL
        CHECK (targetRpeHigh IS NULL OR (targetRpeHigh >= 1 AND targetRpeHigh <= 10 AND targetRpeHigh >= targetRpe));
      ALTER TABLE exercise ADD COLUMN restMaxSeconds INTEGER
        CHECK (restMaxSeconds IS NULL OR restMaxSeconds >= restTargetSeconds);
    `,
  },
];

const CREATE_MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS migration (
    id TEXT PRIMARY KEY,
    appliedAt TEXT NOT NULL
  )`;

/**
 * Identifiers of the migrations not yet applied to `db`, in order.
 * Throws `DatabaseError` (`newerSchema`) when `db` has a migration this app doesn't know,
 * meaning it was written by a newer version and opening it could corrupt it.
 */
export function pendingMigrationIds(db: Database, migrations: readonly Migration[] = MIGRATIONS): string[] {
  db.exec(CREATE_MIGRATION_TABLE);
  const applied = new Set(db.all<{ id: string }>('SELECT id FROM migration').map((row) => row.id));
  const known = new Set(migrations.map((migration) => migration.id));
  const unknown = [...applied].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new DatabaseError(
      'newerSchema',
      `This data was saved by a newer version of the app (${unknown.join(', ')}). Update the app first.`,
    );
  }
  return migrations.filter((migration) => !applied.has(migration.id)).map((migration) => migration.id);
}

/**
 * Applies every pending migration, each in its own transaction.
 * The caller takes a safety snapshot first when `pendingMigrationIds` is not empty (data safety rule).
 * Returns the identifiers it applied.
 */
export function migrate(db: Database, now: Date = new Date(), migrations: readonly Migration[] = MIGRATIONS): string[] {
  const pending = new Set(pendingMigrationIds(db, migrations));
  const applied: string[] = [];
  for (const migration of migrations) {
    if (!pending.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.run('INSERT INTO migration (id, appliedAt) VALUES (?, ?)', [migration.id, now.toISOString()]);
    });
    applied.push(migration.id);
  }
  return applied;
}
