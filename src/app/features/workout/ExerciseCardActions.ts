import type { DeloadSettings, DeloadStage } from '../../../core/logging/DeloadPlan';
import type { SetKind } from '../../../core/models/SetKind';
import type { WorkoutSet } from '../../../core/models/WorkoutSet';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import type { WeightUnit } from '../../../core/units/WeightUnit';
import type { Field } from './Cell';

/** What the owner can do from an exercise card. Each one is a tap; the screen changes when the database does. */
export interface ExerciseCardActions {
  /** Opens the existing exercise page; absent in history edit mode. */
  openExercise?(exerciseId: number): void;
  /** Whether the owner entered/accepted this value during the current editor session. */
  isValueEntered?(setId: number, field: Field): boolean;
  /** Accepts a displayed suggestion in the set's entry unit (seconds for timed reps cells). */
  applySuggestion?(setId: number, field: Field, value: number): void;
  /** Opens the number pad on a cell. */
  edit(setId: number, field: Field): void;
  /** Completes a planned set (asking "Is this right?" first if it looks like a typo), or clears a completed one. */
  toggleCompleted(entry: LiveWorkoutEntry, set: WorkoutSet): void;
  selectKind(setId: number, kind: SetKind): void;
  deleteSet(setId: number): void;
  addSet(entryId: number, kind?: 'working' | 'warmup'): void;
  switchUnit(entryId: number, unit: WeightUnit): void;
  /** Saves or clears the machine manufacturer. */
  setMachineBrand?(entryId: number, brand: string | null): void;
  /** Starts stage 1 or ends deload without changing entered sets. */
  setDeload?(entryId: number, stage: DeloadStage | null, settings?: DeloadSettings, targetSets?: number): void;
  /** Moves the exercise up (`-1`) or down (`1`) one place. */
  move(entryId: number, offset: -1 | 1): void;
  /** Removes the exercise, asking first when it has completed sets. */
  requestRemoval(entry: LiveWorkoutEntry): void;
}
