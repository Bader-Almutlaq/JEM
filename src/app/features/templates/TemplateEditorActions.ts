import type { ProgressionMode } from '../../../core/logging/ProgressionMode';
import type { RepRange } from './RepRangeDialog';
import type { TargetCell } from './TargetCell';

/** What a tap in the template editor's exercise cards can do. Every index is a position in the draft. */
export interface TemplateEditorActions {
  /** Sets shared targets on all non-warm-up sets. */
  setRepRange(exerciseIndex: number, range: RepRange): void;
  /** Sets or clears the exercise note in the draft. */
  setExerciseNotes(exerciseIndex: number, notes: string): void;
  /** Sets the manufacturer in the draft. */
  setMachineBrand(exerciseIndex: number, brand: string | null): void;
  /** Sets this exercise's mode; null restores Automatic. Targets stay unchanged. */
  setProgression(exerciseIndex: number, progressionMode: ProgressionMode | null): void;
  /** Opens the number pad on a target. */
  edit(cell: TargetCell): void;
  addSet(exerciseIndex: number, kind?: 'working' | 'warmup'): void;
  removeSet(exerciseIndex: number, setIndex: number): void;
  /** Steps the set's kind: Working, Warm-up, Drop, Failure. */
  cycleKind(exerciseIndex: number, setIndex: number): void;
  move(exerciseIndex: number, direction: 1 | -1): void;
  /** Joins the exercise to the next one in a superset, or splits them if they already are one. */
  toggleSuperset(exerciseIndex: number): void;
  removeExercise(exerciseIndex: number): void;
}
