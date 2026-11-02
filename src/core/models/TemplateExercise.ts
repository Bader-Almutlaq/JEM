import type { ProgressionMode } from '../logging/ProgressionMode';
/** A TemplateExercise record as stored in SQLite; positions are zero-based and dates are UTC ISO strings. */
export interface TemplateExercise {
  readonly id: number;
  readonly templateId: number;
  readonly exerciseId: number;
  readonly position: number;
  readonly supersetGroup: number | null;
  readonly notes: string | null;
  /** Manufacturer, or null when not recorded. */
  readonly machineBrand?: string | null;
  /** Legacy double preference; used as reps first when progressionMode is null. */
  readonly progression: 'double' | null;
  /** Null selects automatic; explicit off suppresses suggestions. */
  readonly progressionMode?: ProgressionMode | null;
}

/** Raw SQLite row for TemplateExercise. */
export type TemplateExerciseRow = TemplateExercise;

/** Converts a raw row into a TemplateExercise. */
export function fromTemplateExerciseRow(row: TemplateExerciseRow): TemplateExercise {
  return { ...row };
}
