import type { Database } from '../db/Database';

/**
 * Whether this phone has no owner data to back up or replace.
 * Heuristic: seeded exercises/sites and settings alone are a fresh install; any workout
 * (including an unfinished one), saved workout/plan, measurement or custom/imported exercise is data.
 */
export function isDatabaseEmpty(database: Database): boolean {
  return (
    database.value<number>(`
    SELECT NOT (
      EXISTS (SELECT 1 FROM workout)
      OR EXISTS (SELECT 1 FROM template)
      OR EXISTS (SELECT 1 FROM templateFolder)
      OR EXISTS (SELECT 1 FROM bodyMeasurement)
      OR EXISTS (SELECT 1 FROM exercise WHERE source != 'library')
      OR EXISTS (SELECT 1 FROM measurementSite WHERE isCustom = 1)
    )
  `) === 1
  );
}
