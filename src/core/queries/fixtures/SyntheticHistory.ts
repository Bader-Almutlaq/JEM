import type { Database } from '../../db/Database';
import { AppSettingKey, setSetting } from '../../db/AppSetting';
import { ExerciseLibrary } from '../../library/ExerciseLibrary';
import { ExerciseLibrarySeeder } from '../../library/ExerciseLibrarySeeder';
import { PinnedExercises } from '../../analytics/PinnedExercises';
import { KILOGRAMS_PER_POUND } from '../../units/WeightUnit';

/** How much made-up history to write. Every value is synthetic; nothing comes from a real export. */
export interface SyntheticHistoryOptions {
  /** Seed for the deterministic generator: the same seed and options always write the same rows. */
  readonly seed: number;
  /** Whole weeks of history, ending the week before `end`. */
  readonly weeks: number;
  /** Distinct library exercises used across the plans and occasional swaps. */
  readonly exerciseCount: number;
  /** History ends the day before this moment, so `end` behaves like "now". */
  readonly end: Date;
}

/** Ids and totals of what `seedSyntheticHistory` wrote. */
export interface SyntheticHistory {
  readonly exerciseIds: readonly number[];
  readonly folderIds: readonly number[];
  readonly templateIds: readonly number[];
  /** The exercise logged in the most workouts. */
  readonly mostTrainedExerciseId: number;
  readonly workoutCount: number;
  readonly setCount: number;
}

/**
 * Shape of the made-up training. Heuristic: an advanced lifter on four to five sessions a week,
 * six exercises a session, one warm-up and three or four work sets each, a deload every eighth week,
 * and RPE logged on most sets. The numbers only need to resemble real use for timing and cache tests.
 */
export const SyntheticHistoryShape = Object.freeze({
  plans: 3,
  templatesPerPlan: 4,
  exercisesPerTemplate: 6,
  sessionsPerWeek: [4, 5] as const,
  sessionDayOffsets: [0, 1, 3, 4, 5] as const,
  firstSessionHour: 17,
  sessionMinutes: { minimum: 55, maximum: 85 },
  workSets: { minimum: 3, maximum: 4 },
  targetReps: [5, 8, 10, 12] as const,
  repsInReserve: { minimum: 0, maximum: 3 },
  maximumRpe: 10,
  rpeLoggedFraction: 0.85,
  failureFraction: 0.05,
  dropSetFraction: 0.04,
  swapFraction: 0.15,
  poundsFraction: 0.3,
  deloadEveryWeeks: 8,
  deloadLoadFraction: 0.85,
  warmupLoadFraction: 0.55,
  warmupReps: 8,
  curveK: 30,
  compoundStartKilograms: { minimum: 60, maximum: 140 },
  isolationStartKilograms: { minimum: 10, maximum: 40 },
  weeklyGainFraction: { minimum: 0.0015, maximum: 0.004 },
  loadStepKilograms: 2.5,
  machineBrands: ['Hammer Strength', 'Life Fitness', null] as const,
  pinnedExercises: 4,
  millisecondsPerDay: 86_400_000,
  millisecondsPerMinute: 60_000,
  daysPerWeek: 7,
});

/** Mulberry32: a tiny, fast, seedable generator, so the history is identical on every run. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface PlanExercise {
  readonly id: number;
  readonly equipment: string | null;
  readonly mechanic: string;
  readonly startKilograms: number;
  readonly weeklyGain: number;
  readonly unit: 'kg' | 'lb';
}

/**
 * Writes a long synthetic training history: library exercises, three plans of four saved workouts,
 * finished workouts linked to them, deload weeks, machine brands, pins and an active plan.
 * Seeds the bundled exercise library first. Used by the analytics benchmark and the cache tests.
 */
export function seedSyntheticHistory(db: Database, options: SyntheticHistoryOptions): SyntheticHistory {
  const shape = SyntheticHistoryShape;
  const random = generator(options.seed);
  const between = (minimum: number, maximum: number) => minimum + random() * (maximum - minimum);
  const pick = <Item>(items: readonly Item[]): Item => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error('Cannot pick from an empty list.');
    return item;
  };
  ExerciseLibrarySeeder.seed(db, ExerciseLibrary.bundled(), options.end);
  return db.transaction(() => {
    const candidates = db.all<{ id: number; equipment: string | null; mechanic: string }>(
      `SELECT e.id, e.equipment, e.mechanic FROM exercise e
       WHERE e.tracking = 'weight-reps' AND e.mechanic IS NOT NULL AND e.isArchived = 0
         AND EXISTS (SELECT 1 FROM exerciseMuscle em WHERE em.exerciseId = e.id AND em.role = 'primary')
       ORDER BY e.id`,
    );
    const stride = Math.max(1, Math.floor(candidates.length / options.exerciseCount));
    const exercises: PlanExercise[] = candidates
      .filter((_, index) => index % stride === 0)
      .slice(0, options.exerciseCount)
      .map((row) => {
        const range = row.mechanic === 'compound' ? shape.compoundStartKilograms : shape.isolationStartKilograms;
        return {
          ...row,
          startKilograms: between(range.minimum, range.maximum),
          weeklyGain: between(shape.weeklyGainFraction.minimum, shape.weeklyGainFraction.maximum),
          unit: random() < shape.poundsFraction ? 'lb' : 'kg',
        };
      });
    const createdAt = new Date(
      options.end.getTime() - (options.weeks + 1) * shape.daysPerWeek * shape.millisecondsPerDay,
    ).toISOString();
    const folderIds: number[] = [];
    const templateIds: number[] = [];
    const templates: { readonly id: number; readonly exercises: readonly PlanExercise[] }[][] = [];
    for (let plan = 0; plan < shape.plans; plan += 1) {
      const folderId = db.run('INSERT INTO templateFolder (name, position) VALUES (?, ?)', [
        `Plan ${plan + 1}`,
        plan,
      ]).lastInsertRowId;
      folderIds.push(folderId);
      const planTemplates: { readonly id: number; readonly exercises: readonly PlanExercise[] }[] = [];
      for (let index = 0; index < shape.templatesPerPlan; index += 1) {
        const templateId = db.run(
          `INSERT INTO template (name, folderId, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
          [`Day ${index + 1}`, folderId, index, createdAt, createdAt],
        ).lastInsertRowId;
        templateIds.push(templateId);
        const first = (plan * shape.templatesPerPlan + index) * shape.exercisesPerTemplate;
        const chosen = Array.from({ length: shape.exercisesPerTemplate }, (_, offset) => {
          const exercise = exercises[(first + offset) % exercises.length];
          if (exercise === undefined) throw new Error('The library has no weight-and-reps exercises.');
          return exercise;
        });
        chosen.forEach((exercise, position) => {
          const templateExerciseId = db.run(
            'INSERT INTO templateExercise (templateId, exerciseId, position) VALUES (?, ?, ?)',
            [templateId, exercise.id, position],
          ).lastInsertRowId;
          for (let set = 0; set < shape.workSets.maximum; set += 1) {
            const reps = shape.targetReps[position % shape.targetReps.length] ?? shape.warmupReps;
            db.run(
              `INSERT INTO templateSet (templateExerciseId, position, kind, targetRepsLow, targetRepsHigh, targetRpe)
               VALUES (?, ?, 'working', ?, ?, 8)`,
              [templateExerciseId, set, reps, reps + 2],
            );
          }
        });
        planTemplates.push({ id: templateId, exercises: chosen });
      }
      templates.push(planTemplates);
    }

    const usage = new Map<number, number>();
    let workoutCount = 0;
    let setCount = 0;
    const firstMonday = new Date(options.end);
    firstMonday.setHours(0, 0, 0, 0);
    firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % shape.daysPerWeek));
    firstMonday.setDate(firstMonday.getDate() - options.weeks * shape.daysPerWeek);
    let rotation = 0;
    for (let week = 0; week < options.weeks; week += 1) {
      const planTemplates = templates[Math.min(shape.plans - 1, Math.floor((week * shape.plans) / options.weeks))];
      if (planTemplates === undefined) continue;
      const isDeload = (week + 1) % shape.deloadEveryWeeks === 0;
      const sessions = pick(shape.sessionsPerWeek);
      for (let session = 0; session < sessions; session += 1) {
        const template = planTemplates[rotation % planTemplates.length];
        rotation += 1;
        if (template === undefined) continue;
        const startedAt = new Date(firstMonday);
        startedAt.setDate(startedAt.getDate() + week * shape.daysPerWeek + (shape.sessionDayOffsets[session] ?? 0));
        startedAt.setHours(shape.firstSessionHour, Math.floor(between(0, 60)), 0, 0);
        if (startedAt >= options.end) continue;
        const minutes = between(shape.sessionMinutes.minimum, shape.sessionMinutes.maximum);
        const endedAt = new Date(startedAt.getTime() + minutes * shape.millisecondsPerMinute);
        const workoutId = db.run(
          `INSERT INTO workout (startedAt, endedAt, name, source, templateId) VALUES (?, ?, ?, 'app', ?)`,
          [startedAt.toISOString(), endedAt.toISOString(), `Day ${(rotation % planTemplates.length) + 1}`, template.id],
        ).lastInsertRowId;
        workoutCount += 1;
        const lineup = template.exercises.map((exercise) =>
          random() < shape.swapFraction ? pick(exercises) : exercise,
        );
        const seen = new Set<number>();
        lineup.forEach((exercise, position) => {
          if (seen.has(exercise.id)) return;
          seen.add(exercise.id);
          usage.set(exercise.id, (usage.get(exercise.id) ?? 0) + 1);
          const brand = exercise.equipment === 'machine' ? pick(shape.machineBrands) : null;
          const entryId = db.run(
            `INSERT INTO workoutExercise (workoutId, exerciseId, position, deloadStage, machineBrand) VALUES (?, ?, ?, ?, ?)`,
            [workoutId, exercise.id, position, isDeload ? 1 : null, brand],
          ).lastInsertRowId;
          const oneRepMax =
            exercise.startKilograms * (1 + exercise.weeklyGain * week) * (isDeload ? shape.deloadLoadFraction : 1);
          const targetReps = shape.targetReps[position % shape.targetReps.length] ?? shape.warmupReps;
          const sets: { kind: string; kilograms: number; reps: number; rpe: number | null }[] = [
            {
              kind: 'warmup',
              kilograms: roundTo(oneRepMax * shape.warmupLoadFraction, shape.loadStepKilograms),
              reps: shape.warmupReps,
              rpe: null,
            },
          ];
          const workSets = Math.round(between(shape.workSets.minimum, shape.workSets.maximum));
          for (let index = 0; index < workSets; index += 1) {
            const repsInReserve = Math.round(between(shape.repsInReserve.minimum, shape.repsInReserve.maximum) * 2) / 2;
            const reps = Math.max(1, targetReps + Math.round(between(-2, 2)));
            const kilograms = roundTo(
              oneRepMax / (1 + (reps + repsInReserve - 1) / shape.curveK),
              shape.loadStepKilograms,
            );
            const roll = random();
            const kind =
              roll < shape.failureFraction
                ? 'failure'
                : roll < shape.failureFraction + shape.dropSetFraction
                  ? 'drop'
                  : 'working';
            const rpe =
              kind === 'failure'
                ? shape.maximumRpe
                : random() < shape.rpeLoggedFraction
                  ? shape.maximumRpe - repsInReserve
                  : null;
            sets.push({ kind, kilograms, reps, rpe });
          }
          sets.forEach((set, setPosition) => {
            const typed = exercise.unit === 'kg' ? set.kilograms : Math.round(set.kilograms / KILOGRAMS_PER_POUND);
            const kilograms = exercise.unit === 'kg' ? typed : typed * KILOGRAMS_PER_POUND;
            db.run(
              `INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, completedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [entryId, setPosition, set.kind, kilograms, exercise.unit, set.reps, set.rpe, endedAt.toISOString()],
            );
            setCount += 1;
          });
        });
      }
    }
    const byUsage = [...usage].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [exerciseId] of byUsage.slice(0, shape.pinnedExercises))
      PinnedExercises.pin(db, exerciseId, options.end);
    const activePlan = folderIds.at(-1);
    if (activePlan !== undefined) setSetting(db, AppSettingKey.activePlanId, String(activePlan));
    return {
      exerciseIds: exercises.map((exercise) => exercise.id),
      folderIds,
      templateIds,
      mostTrainedExerciseId: byUsage[0]?.[0] ?? 0,
      workoutCount,
      setCount,
    };
  });
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}
