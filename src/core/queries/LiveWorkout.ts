import { DeloadPlan, type DeloadSuggestion } from '../logging/DeloadPlan';
import type { Database } from '../db/Database';
import type { Workout } from '../models/Workout';
import type { TemplateSetDraft } from '../templates/TemplateDraft';
import type { WorkoutSet } from '../models/WorkoutSet';
import { workoutDetail, type WorkoutDetail, type WorkoutDetailEntry } from './WorkoutHistory';
import type { ProgressionMode } from '../logging/ProgressionMode';
import { resolveProgressionMode } from '../logging/resolveProgressionMode';
import { progressionHistory } from './progressionHistory';
import { progressionLoadHeld, progressionPlan, type ProgressionSuggestion } from '../logging/ProgressionPlan';
import type { TemplateDraft } from '../templates/TemplateDraft';
import { TemplateCatalog } from './TemplateCatalog';
import {
  matchPreviousSets,
  machinePreviousPerformance,
  previousExerciseEntryBefore,
  deloadBaseline,
  completedEntrySets,
} from './PreviousPerformance';

/** An exercise with planned and completed sets and the previous session's completed sets. */
export interface LiveWorkoutEntry extends WorkoutDetailEntry {
  readonly previous: readonly WorkoutSet[];
  /** Saved template targets, independent of progression and deload. */
  readonly plannedTargets?: readonly TemplateSetDraft[];
  /** True when recorded machine history was unavailable and previous sets are from another machine. */
  readonly previousOtherMachine?: boolean;
  /** Ephemeral deload values replace progression; the stored stage remains visible without history. */
  readonly deload?: {
    readonly reductionPercent: number;
    /** Pre-cycle sets used to preview a custom build-back load. */
    readonly baseline?: readonly WorkoutSet[];
    readonly suggestions: readonly (DeloadSuggestion & { readonly setId: number })[];
  };
  /** Automatic calculations keyed to live sets; absent when off/deload; empty without scoped normal history. */
  readonly progression?: {
    /** Resolved preference for the exercise options sheet; omitted only by older in-memory callers. */
    readonly mode?: ProgressionMode;
    readonly targets: readonly TemplateSetDraft[];
    readonly suggestions: readonly (ProgressionSuggestion & { readonly setId: number })[];
  };
}

/** Plain data for the workout being logged, including previous performance. */
export interface LiveWorkoutSnapshot {
  readonly workout: Workout;
  readonly entries: readonly LiveWorkoutEntry[];
}

/** Returns a workout and previous performance, or undefined if the workout no longer exists. */
export function liveWorkoutSnapshot(db: Database, workoutId: number): LiveWorkoutSnapshot | undefined {
  const detail = workoutDetail(db, workoutId);
  if (detail === undefined) return undefined;
  const template =
    detail.workout.templateId === null ? undefined : TemplateCatalog.detail(db, detail.workout.templateId);
  return withWorkoutPerformance(db, detail, template);
}

/** Attaches the live Previous, targets and suggestions to persisted or unstarted rows without writing.
 * A null excluded workout identifies an unstarted session; its local row ids are never queried.
 */
export function withWorkoutPerformance(
  db: Database,
  detail: WorkoutDetail,
  template: TemplateDraft | undefined,
  excludedWorkoutId: number | null = detail.workout.id,
): LiveWorkoutSnapshot {
  return {
    workout: detail.workout,
    entries: detail.entries.map((item, index) => {
      // Occurrence, rather than screen position, survives exercise reordering and repeated exercises.
      const occurrence = detail.entries
        .slice(0, index)
        .filter((entry) => entry.exercise.id === item.exercise.id).length;
      const planned = template?.exercises.filter((entry) => entry.exerciseId === item.exercise.id)[occurrence];
      const plannedTargets = planned === undefined ? {} : { plannedTargets: planned.sets };
      const stage = item.entry.deloadStage ?? null;
      const enabled =
        stage === null && detail.workout.isInProgress && planned !== undefined && planned.progressionMode !== 'off';
      const result = machinePreviousPerformance(
        db,
        item.exercise.id,
        excludedWorkoutId,
        enabled ? detail.workout.templateId : null,
        enabled || (item.entry.machineBrand ?? null) !== null ? occurrence : null,
        item.entry.machineBrand ?? null,
      );
      const history = enabled
        ? progressionHistory(
            db,
            item.exercise.id,
            detail.workout.templateId,
            occurrence,
            excludedWorkoutId,
            item.entry.machineBrand ?? null,
          )
        : [];
      const previous = history[0] ?? result.sets;
      if (stage !== null && detail.workout.isInProgress) {
        const priorEntry = previousExerciseEntryBefore(
          db,
          {
            exerciseId: item.exercise.id,
            workoutId: excludedWorkoutId,
            startedAt: detail.workout.startedAt,
            occurrence,
          },
          item.entry.machineBrand ?? null,
        );
        // Deload is per exercise across workouts, independent of an opt-in template progression mode.
        const prior = priorEntry === undefined ? [] : completedEntrySets(db, priorEntry.id);
        const baseline =
          priorEntry === undefined
            ? []
            : (priorEntry.deloadStage ?? null) === null
              ? completedEntrySets(db, priorEntry.id)
              : deloadBaseline(db, priorEntry.id, item.entry.machineBrand ?? null);
        const settings = {
          mode: item.entry.deloadMode ?? null,
          loadPercent: item.entry.deloadLoadPercent ?? null,
          setPercent: item.entry.deloadSetPercent ?? null,
        };
        const units = new Set(item.sets.map((set) => set.entryUnit));
        const calculated = new Map(
          [...units].map((unit) => [
            unit,
            DeloadPlan.suggestions(prior, item.sets, item.exercise, stage, unit, baseline, settings),
          ]),
        );
        return {
          ...item,
          ...plannedTargets,
          previous: (item.entry.machineBrand ?? null) === null ? prior : previous,
          previousOtherMachine: result.otherMachine,
          deload: {
            reductionPercent: DeloadPlan.reductionPercent(item.exercise, stage, settings),
            baseline,
            suggestions: item.sets.flatMap((set, position) => {
              const suggestion = calculated.get(set.entryUnit)?.[position];
              return set.isCompleted || suggestion === undefined || suggestion === null
                ? []
                : [{ ...suggestion, setId: set.id }];
            }),
          },
        };
      }
      if (!enabled || planned === undefined)
        return { ...item, ...plannedTargets, previous, previousOtherMachine: result.otherMachine };
      const targets = matchPreviousSets(item.sets, planned.sets);
      const units = new Set(item.sets.map((set) => set.entryUnit));
      const mode = resolveProgressionMode(item.exercise, history[0] ?? [], planned);
      const holdLoad = progressionLoadHeld(history, planned.sets);
      const calculated = new Map(
        [...units].map((unit) => [
          unit,
          progressionPlan(
            history[0] ?? [],
            planned.sets,
            item.exercise,
            unit,
            resolveProgressionMode(item.exercise, history[0] ?? [], planned, unit),
            holdLoad,
          ),
        ]),
      );
      const positions = new Map(planned.sets.map((target, position) => [target, position]));
      return {
        ...item,
        ...plannedTargets,
        previous,
        previousOtherMachine: result.otherMachine,
        progression: {
          mode,
          targets: planned.sets,
          suggestions: item.sets.flatMap((set, position) => {
            if (result.otherMachine) return [];
            const target = targets[position];
            const targetPosition = target === undefined ? undefined : positions.get(target);
            const suggestion =
              targetPosition === undefined ? undefined : calculated.get(set.entryUnit)?.[targetPosition];
            return set.isCompleted || suggestion === undefined || suggestion === null
              ? []
              : [{ ...suggestion, setId: set.id }];
          }),
        },
      };
    }),
  };
}
