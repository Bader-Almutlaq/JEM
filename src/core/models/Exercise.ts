import type { Equipment } from '../library/Equipment';
import type { ExerciseTracking } from '../library/ExerciseTracking';
import type { Mechanic } from '../library/Mechanic';
import type { MovementPattern } from '../library/MovementPattern';
import type { WeightUnit } from '../units/WeightUnit';
import type { RecordSource } from './RecordSource';

/**
 * An exercise the owner can log, e.g. "Bench Press (Barbell)". Table `exercise`.
 *
 * Rows come from three places (`source`): the built-in library (seeded on launch, `libraryKey`
 * set), the Strong import (names not in the library), and exercises the owner creates.
 *
 * The vocabularies for `equipment`, `movementPattern`, `mechanic` and `tracking` are owned by
 * `src/core/library`. Values are trusted as written by WorkoutCore (the schema checks `mechanic`
 * and `tracking`).
 */
export interface Exercise {
  readonly id: number;
  /** Display name, "Movement (Equipment)". Unique, case-insensitive. */
  readonly name: string;
  readonly equipment: Equipment | null;
  readonly movementPattern: MovementPattern | null;
  readonly mechanic: Mechanic | null;
  readonly source: RecordSource;
  /** The library entry's key this row mirrors; `null` for custom and unmatched Strong exercises. */
  readonly libraryKey: string | null;
  /** Loads the target muscle hardest at long lengths (report, "long-muscle-length emphasis"). */
  readonly isLengthenedBiased: boolean;
  /** What a set records (weight and reps, reps only, time…). */
  readonly tracking: ExerciseTracking;
  /** Unit the logging screen uses for this exercise (see `docs/DESIGN.md` → Units). */
  readonly defaultEntryUnit: WeightUnit;
  /** Rest timer length the owner chose for this exercise, in seconds; `null` uses the app default. */
  readonly restTargetSeconds: number | null;
  /** Upper rest target in seconds; null means a single target. */
  readonly restMaxSeconds?: number | null;
  /** Load increment in exact kg; null/omitted uses the equipment default. Optional for older in-memory callers. */
  readonly loadStepKilograms?: number | null;
  /** Empty bar/carriage in exact kg; null/omitted uses the equipment default. */
  readonly barWeightKilograms?: number | null;
  /** Suggested warm-up count, 0–4; null/omitted uses the equipment default. */
  readonly warmupSetCount?: number | null;
  /** Newline-separated library instructions; null when unavailable. Omitted by older in-memory callers. */
  readonly instructions?: string | null;
  /** JSON array of pinned source image paths; null when unavailable. Omitted by older in-memory callers. */
  readonly imageKeys?: string | null;
  /** Hidden from search and pickers; history is kept. */
  readonly isArchived: boolean;
  /** UTC ISO 8601 timestamp. */
  readonly createdAt: string;
}

/** A raw `exercise` row as SQLite returns it: booleans are 0/1 integers. */
export interface ExerciseRow extends Omit<Exercise, 'isLengthenedBiased' | 'isArchived'> {
  readonly isLengthenedBiased: number;
  readonly isArchived: number;
}

/** Converts a raw `exercise` row to an `Exercise` (0/1 integers become booleans). */
export function fromExerciseRow(row: ExerciseRow): Exercise {
  return {
    ...row,
    isLengthenedBiased: row.isLengthenedBiased === 1,
    isArchived: row.isArchived === 1,
  };
}
