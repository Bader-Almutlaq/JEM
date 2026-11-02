import type { Database } from '../db/Database';
import { fromExerciseRow, type ExerciseRow } from '../models/Exercise';
import type { WorkoutSet } from '../models/WorkoutSet';
import { withWorkoutPerformance, type LiveWorkoutSnapshot } from '../queries/LiveWorkout';
import {
  latestMachineBrand,
  machinePreviousPerformance,
  matchPreviousSets,
  previousExerciseEntryBefore,
} from '../queries/PreviousPerformance';
import { TemplateCatalog } from '../queries/TemplateCatalog';
import { progressionHistory } from '../queries/progressionHistory';
import { TemplateStoreError } from '../templates/TemplateStoreError';
import { loadProfileFor } from '../units/LoadableWeight';
import { DeloadPlan } from './DeloadPlan';
import { WorkoutLoggerError } from './WorkoutLoggerError';
import { automaticWarmupCount, warmupSets } from './WarmupPlan';

/** An unstarted session: workout/entry/planned-set keys are local; historical Previous retains its stored ids. */
export interface WorkoutPreview extends LiveWorkoutSnapshot {
  /** Local keys of generated warm-ups; Start maps these to persisted ids for suggestion provenance. */
  readonly suggestedWarmupSetIds: readonly number[];
}

/** Heuristic: nonpositive local identities cannot be mistaken for the positive ids inserted by Start. */
const PreviewIdentity = Object.freeze({ workout: 0, firstRow: -1 });

/** Reads exactly the prefill Start will persist, including warm-ups, deload and ephemeral suggestions.
 * No rows or timestamps are written. Loads remain exact kg; template seconds apply only to timed exercises.
 * Missing templates throw the same readable error as Start. An active workout does not prevent previewing.
 */
export function workoutPreview(db: Database, templateId: number, now: Date): WorkoutPreview {
  const template = TemplateCatalog.detail(db, templateId);
  if (template === undefined) throw new TemplateStoreError('notFound');
  let nextId = PreviewIdentity.firstRow;
  const suggestedWarmupSetIds: number[] = [];
  const workout = {
    id: PreviewIdentity.workout,
    startedAt: now.toISOString(),
    endedAt: null,
    name: template.name,
    notes: null,
    source: 'app' as const,
    sourceKey: null,
    isInProgress: true,
    templateId,
  };
  const entries = template.exercises.map((planned, index) => {
    const row = db.get<ExerciseRow>('SELECT * FROM exercise WHERE id = ?', [planned.exerciseId]);
    if (row === undefined) throw new WorkoutLoggerError('exerciseNotFound');
    const exercise = fromExerciseRow(row);
    const entryId = nextId--;
    const brand = planned.machineBrand ?? latestMachineBrand(db, exercise.id, null);
    const occurrence = template.exercises.slice(0, index).filter((item) => item.exerciseId === exercise.id).length;
    const priorEntry = previousExerciseEntryBefore(db, {
      exerciseId: exercise.id,
      workoutId: null,
      startedAt: workout.startedAt,
      occurrence,
    });
    const stage = DeloadPlan.nextStage(priorEntry?.deloadStage ?? null, priorEntry?.deloadMode ?? null);
    // Unless progression is off or a deload is running, the workout's last normal session seeds the values (T-090),
    // matching the live workout's rule.
    const isProgressing = planned.progressionMode !== 'off' && stage === null;
    const fallback = machinePreviousPerformance(
      db,
      exercise.id,
      null,
      isProgressing ? templateId : null,
      isProgressing || brand !== null ? occurrence : null,
      brand,
    ).sets;
    const previous = isProgressing
      ? (progressionHistory(db, exercise.id, templateId, occurrence, null, brand)[0] ?? fallback)
      : fallback;
    const matches = matchPreviousSets(planned.sets, previous);
    const timed = exercise.tracking === 'duration' || exercise.tracking === 'weight-duration';
    const emptySet = (position: number): WorkoutSet => ({
      id: nextId--,
      workoutExerciseId: entryId,
      position,
      kind: 'working',
      weightKilograms: 0,
      entryUnit: exercise.defaultEntryUnit,
      reps: 0,
      rpe: null,
      durationSeconds: null,
      distanceMeters: null,
      side: 'both',
      restBeforeSeconds: null,
      completedAt: null,
      isCompleted: false,
      notes: null,
    });
    let sets = planned.sets.map((target, position): WorkoutSet => {
      const prior = matches[position];
      return {
        ...emptySet(position),
        kind: target.kind,
        weightKilograms: prior?.weightKilograms ?? 0,
        reps: prior?.reps ?? (timed ? 0 : (target.targetRepsLow ?? 0)),
        rpe: prior?.rpe ?? null,
        durationSeconds: prior?.durationSeconds ?? (timed ? target.targetRepsLow : null),
      };
    });
    // Warm-ups the template holds stay as placed unless the exercise has its own explicit count, which replaces
    // only their load/reps/unit. Without either, the automatic plan fills in from the first working set.
    const inherited = sets.filter((set) => set.kind === 'warmup');
    const hasExplicitWarmupCount = exercise.warmupSetCount !== null && exercise.warmupSetCount !== undefined;
    if (hasExplicitWarmupCount || inherited.length === 0) {
      const work = sets.filter((set) => set.kind !== 'warmup');
      const generated = warmupSets(
        work[0]?.weightKilograms ?? 0,
        automaticWarmupCount(exercise),
        loadProfileFor(exercise, exercise.defaultEntryUnit),
      );
      sets = [
        ...generated.map((suggestion, position): WorkoutSet => {
          const set = {
            ...(inherited[position] ?? emptySet(position)),
            kind: 'warmup' as const,
            ...suggestion,
          };
          suggestedWarmupSetIds.push(set.id);
          return set;
        }),
        ...work,
      ].map((set, position) => ({ ...set, position }));
    }
    return {
      exercise,
      entry: {
        id: entryId,
        workoutId: workout.id,
        exerciseId: exercise.id,
        position: index,
        supersetGroup: planned.supersetGroup,
        notes: planned.notes,
        machineBrand: brand,
        deloadStage: stage,
        deloadMode:
          stage === null
            ? null
            : priorEntry?.deloadMode === 'both'
              ? ('load' as const)
              : (priorEntry?.deloadMode ?? null),
        deloadLoadPercent: stage === null ? null : (priorEntry?.deloadLoadPercent ?? null),
        deloadSetPercent: stage === null ? null : (priorEntry?.deloadSetPercent ?? null),
      },
      sets,
    };
  });
  return { ...withWorkoutPerformance(db, { workout, entries }, template, null), suggestedWarmupSetIds };
}
