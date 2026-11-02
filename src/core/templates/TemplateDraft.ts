import type { SetKind } from '../models/SetKind';

/** A planned set; null targets are unspecified. */
export interface TemplateSetDraft {
  readonly kind: SetKind;
  readonly targetRepsLow: number | null;
  readonly targetRepsHigh: number | null;
  readonly targetRpe: number | null;
  /** Upper RPE target; absent or null means a single value. */
  readonly targetRpeHigh?: number | null;
}
/** An exercise in its editor order, with its planned sets. */
export interface TemplateExerciseDraft {
  readonly exerciseId: number;
  readonly supersetGroup: number | null;
  readonly notes: string | null;
  readonly sets: readonly TemplateSetDraft[];
  /** Manufacturer, or null when not recorded. */
  readonly machineBrand?: string | null;
  /** Omitted/null means off, preserving older draft callers. Targets belong to each set. */
  readonly progression?: 'double' | null;
}
/** Editable template data; id is absent for a new template. */
export interface TemplateDraft {
  readonly id?: number;
  readonly name: string;
  readonly folderId: number | null;
  readonly notes: string | null;
  /** ISO weekday, Monday = 1; absent or null means unscheduled. */
  readonly weekday?: number | null;
  readonly exercises: readonly TemplateExerciseDraft[];
}
