import type { Database as RawDatabase } from '@sqlite.org/sqlite-wasm';

/** Heuristic: unusually broad statements fall back to full invalidation, with bounded TEMP storage. */
export const ExerciseChangeLimits = Object.freeze({ exercises: 256 });

/**
 * Tables no per-exercise cache entry reads (T-094's dependency audit): settings, body measurements,
 * pins and saved workouts. Writes to them still move the global data version, so whole-screen results
 * refresh; they just don't force every lift's history and curve to be rebuilt (Finish writes backup
 * metadata to settings, which made every finished workout a full rebuild).
 */
const TABLES_WITHOUT_EXERCISE_DATA: ReadonlySet<string> = new Set([
  'appSetting',
  'bodyMeasurement',
  'measurementSite',
  'pinnedExercise',
  'template',
  'templateExercise',
  'templateFolder',
  'templateSet',
]);

/**
 * Connection-local change tracking. TEMP triggers observe cascades and both sides of row moves;
 * unsupported tables mark the entire cache stale. Nothing is persisted in backup files or migrations.
 */
export class ExerciseChanges {
  private schema = '';
  private triggerNames: string[] = [];

  constructor(private readonly raw: RawDatabase) {
    this.prepare();
  }

  /** Rebuilds tracking after schema changes, including migrations or removed TEMP triggers. */
  prepare(): void {
    // REPLACE deletes must report the old owner as well as the inserted row's new owner.
    this.raw.exec('PRAGMA recursive_triggers = ON');
    if (this.schema === this.schemaKey()) return;
    for (const name of this.triggerNames) this.raw.exec(`DROP TRIGGER IF EXISTS temp.${quote(name)}`);
    this.raw.exec(`
      DROP TABLE IF EXISTS temp.changedExercise;
      DROP TABLE IF EXISTS temp.changedExerciseState;
      CREATE TEMP TABLE changedExercise (exerciseId INTEGER PRIMARY KEY);
      CREATE TEMP TABLE changedExerciseState (allChanged INTEGER NOT NULL);
      INSERT INTO changedExerciseState VALUES (0);
    `);
    this.triggerNames = [];
    const tables = this.raw.selectObjects(`
      SELECT name FROM main.sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `);
    for (const table of tables) {
      const name = String(table.name);
      for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
        const triggerName = `trackExercise_${name}_${operation}`;
        const selections = affectedExercises(name, operation);
        if (selections !== null && selections.length === 0) continue;
        // BEFORE DELETE preserves parent/child links before foreign-key cascades remove them.
        const timing = operation === 'DELETE' ? 'BEFORE' : 'AFTER';
        const body =
          selections === null
            ? 'UPDATE changedExerciseState SET allChanged = 1;'
            : selections
                .map(
                  (selection) => `
                    INSERT INTO changedExercise (exerciseId)
                    SELECT DISTINCT candidate.exerciseId FROM (${selection}) AS candidate
                    WHERE (SELECT COUNT(*) FROM changedExercise) <= ${ExerciseChangeLimits.exercises}
                      AND NOT EXISTS (
                        SELECT 1 FROM changedExercise WHERE exerciseId = candidate.exerciseId
                      )
                    LIMIT MAX(0, ${ExerciseChangeLimits.exercises + 1} - (SELECT COUNT(*) FROM changedExercise));
                    UPDATE changedExerciseState SET allChanged = 1
                    WHERE (SELECT COUNT(*) FROM changedExercise) > ${ExerciseChangeLimits.exercises};
                  `,
                )
                .join('\n');
        this.raw.exec(`
          CREATE TEMP TRIGGER ${quote(triggerName)} ${timing} ${operation} ON main.${quote(name)}
          BEGIN
            ${body}
          END;
        `);
        this.triggerNames.push(triggerName);
      }
    }
    this.schema = this.schemaKey();
  }

  /** Reads and clears touched ids; null means unknown, unsupported, or too broad: invalidate all. */
  take(): readonly number[] | null {
    // DDL may have removed tracking itself. Its caller must use full invalidation in that case.
    if (this.schema !== this.schemaKey()) return null;
    const allChanged = this.raw.selectValue('SELECT allChanged FROM temp.changedExerciseState');
    const ids = this.raw
      .selectObjects('SELECT exerciseId FROM temp.changedExercise')
      .map((row) => Number(row.exerciseId));
    this.raw.exec(`
      DELETE FROM temp.changedExercise;
      UPDATE temp.changedExerciseState SET allChanged = 0;
    `);
    // No ids and no unknown write: only tables without exercise data (or no rows) changed.
    return allChanged === 1 ? null : ids;
  }

  private schemaKey(): string {
    return `${String(this.raw.selectValue('PRAGMA main.schema_version'))}:${String(this.raw.selectValue('PRAGMA temp.schema_version'))}`;
  }
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function affectedExercises(table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE'): readonly string[] | null {
  const records = operation === 'UPDATE' ? ['OLD', 'NEW'] : [operation === 'DELETE' ? 'OLD' : 'NEW'];
  if (TABLES_WITHOUT_EXERCISE_DATA.has(table)) return [];
  switch (table) {
    case 'workoutSet':
      return records.map(
        (record) => `SELECT exerciseId FROM main.workoutExercise WHERE id = ${record}.workoutExerciseId`,
      );
    case 'workoutExercise':
    case 'exerciseMuscle':
      return records.map((record) => `SELECT ${record}.exerciseId AS exerciseId`);
    case 'exercise':
      return records.map((record) => `SELECT ${record}.id AS exerciseId`);
    case 'workout':
      // A new workout row has no entries yet; each entry and set added to it is tracked on its own insert.
      // Per-exercise history boundaries are keyed by the lift, so an empty workout changes no lift.
      if (operation === 'INSERT') return [];
      return records.map((record) => `SELECT exerciseId FROM main.workoutExercise WHERE workoutId = ${record}.id`);
    default:
      return null;
  }
}
