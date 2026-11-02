import { workoutPreview } from './WorkoutPreview';
import { normalizeMachineBrand } from '../library/MachineBrands';
import { latestMachineBrand, machinePreviousPerformance } from '../queries/PreviousPerformance';
import { DeloadPlan, type DeloadSettings, type DeloadStage } from './DeloadPlan';
import { fromExerciseRow, type ExerciseRow } from '../models/Exercise';
import { loadProfileFor } from '../units/LoadableWeight';
import { automaticWarmupCount, refreshWarmups, warmupSets } from './WarmupPlan';
import type { Database } from '../db/Database';
import type { SetKind } from '../models/SetKind';
import type { WorkoutSetRow } from '../models/WorkoutSet';
import type { WeightUnit } from '../units/WeightUnit';
import { previousPerformance, previousExerciseEntry, deloadBaseline } from '../queries/PreviousPerformance';
import { WorkoutLoggerError } from './WorkoutLoggerError';

/** Limits that catch input mistakes without restricting real training; RPE bounds: Zourdos 2016. */
export const WorkoutLoggerLimits = {
  /** Highest weight accepted for one set, in kg. Above every recorded human lift. */
  maximumKilograms: 1000,
  /** Highest rep count accepted for one set. */
  maximumReps: 1000,
  /** RPE scale bounds (Zourdos 2016). */
  rpeRange: { minimum: 1, maximum: 10 },
} as const;

/** What finishing a workout kept and dropped; workoutId is null if nothing was completed. */
export interface FinishResult {
  readonly workoutId: number | null;
  readonly completedSets: number;
  readonly droppedSets: number;
}

/** One immediately saved metadata change to a finished workout; duration is in seconds, null keeps an unknown end. */
export type FinishedWorkoutChange =
  | { readonly field: 'name' | 'notes'; readonly value: string }
  | { readonly field: 'startedAt'; readonly value: string }
  | { readonly field: 'durationSeconds'; readonly value: number | null };

/** Readable failures for finished-only editing and malformed deletion protection. */
class PastWorkoutError extends Error {
  override readonly name = 'PastWorkoutError';
  constructor(readonly kind: 'notFinished' | 'invalidTime' | 'invalidDeletedKeys') {
    const messages = {
      notFinished: 'Open the workout in progress from the Workout tab.',
      invalidTime: 'Enter a valid start time and a finite duration of zero or more seconds.',
      invalidDeletedKeys:
        'Deleted import records could not be read. Restore a safety copy before importing or deleting.',
    };
    super(messages[kind]);
  }
}

/** Setting key owned here because deletion and re-import share the same protection. */
const DELETED_SOURCE_KEYS = 'deletedSourceKeys';

/** SI time conversion; database timestamps use milliseconds and logged durations use seconds. */
const TIME_UNITS = { millisecondsPerSecond: 1000 } as const;

/** Each logging action is a transaction; positions stay dense and zero-based. */
export class WorkoutLogger {
  private readonly warmupState = new Map<
    number,
    { edited: Set<number>; suggested: Set<number>; suppressed: boolean }
  >();

  constructor(private readonly db: Database) {}

  /** Untouched generated warm-ups in this worker session; the UI draws their stored values as suggestions. */
  suggestedWarmupSetIds(entryId: number): number[] {
    const state = this.warmupState.get(entryId);
    if (state === undefined) return [];
    return this.db
      .all<{ id: number }>(
        `
      SELECT id FROM workoutSet WHERE workoutExerciseId = ? AND kind = 'warmup' AND isCompleted = 0
    `,
        [entryId],
      )
      .filter((set) => state.suggested.has(set.id))
      .map((set) => set.id);
  }

  private warmupStateFor(entryId: number) {
    let state = this.warmupState.get(entryId);
    if (state === undefined) {
      // After reload, preserve existing rows and absent warm-ups when work already had a load.
      const existing = this.db.all<{ id: number }>(
        `
        SELECT id FROM workoutSet WHERE workoutExerciseId = ? AND kind = 'warmup'
      `,
        [entryId],
      );
      const workingWeight =
        this.db.value<number>(
          `
        SELECT weightKilograms FROM workoutSet WHERE workoutExerciseId = ? AND kind <> 'warmup' ORDER BY position LIMIT 1
      `,
          [entryId],
        ) ?? 0;
      state = {
        edited: new Set(existing.map((set) => set.id)),
        suggested: new Set<number>(),
        suppressed: existing.length === 0 && workingWeight > 0,
      };
      this.warmupState.set(entryId, state);
    }
    return state;
  }

  /**
   * Starts warm-up tracking for a new live entry. Warm-ups the template already holds stay as the owner placed
   * them (protected, nothing generated beside them) unless the exercise has its own explicit count; otherwise the
   * automatic plan fills in from the first working set.
   */
  private initializeWarmups(entryId: number, preserveTemplateWarmups = false): void {
    const entry = this.requireEntry(entryId);
    const count = this.db.value<number | null>('SELECT warmupSetCount FROM exercise WHERE id = ?', [entry.exerciseId]);
    const inherited =
      preserveTemplateWarmups && (count === null || count === undefined)
        ? this.db.all<{ id: number }>(`SELECT id FROM workoutSet WHERE workoutExerciseId = ? AND kind = 'warmup'`, [
            entryId,
          ])
        : [];
    this.warmupState.set(entryId, {
      edited: new Set(inherited.map((set) => set.id)),
      suggested: new Set(),
      suppressed: inherited.length > 0,
    });
    this.refreshEntryWarmups(entryId);
  }

  private refreshEntryWarmups(entryId: number): void {
    const entry = this.requireEntry(entryId);
    if (this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [entry.workoutId]) !== 1) return;
    const row = this.db.get<ExerciseRow>('SELECT * FROM exercise WHERE id = ?', [entry.exerciseId]);
    if (row === undefined) throw new WorkoutLoggerError('exerciseNotFound');
    const exercise = fromExerciseRow(row);
    const existing = this.db.all<WorkoutSetRow>(
      `
      SELECT * FROM workoutSet WHERE workoutExerciseId = ? AND kind = 'warmup' ORDER BY position
    `,
      [entryId],
    );
    const state = this.warmupStateFor(entryId);
    if (state.suppressed) return;
    const first = this.db.get<WorkoutSetRow>(
      `
      SELECT * FROM workoutSet WHERE workoutExerciseId = ? AND kind <> 'warmup' ORDER BY position LIMIT 1
    `,
      [entryId],
    );
    const plan = warmupSets(
      first?.weightKilograms ?? 0,
      automaticWarmupCount(exercise),
      loadProfileFor(exercise, exercise.defaultEntryUnit),
    );
    const refreshed = refreshWarmups(
      existing.map((set) => ({ ...set, isCompleted: set.isCompleted === 1 })),
      plan,
      state.edited,
    );
    const retained = new Set(refreshed.map((set) => set.id));
    for (const old of existing) {
      if (!retained.has(old.id)) {
        this.db.run('DELETE FROM workoutSet WHERE id = ?', [old.id]);
        state.suggested.delete(old.id);
      }
    }
    const order = this.db
      .all<{ id: number }>(
        `
      SELECT id FROM workoutSet WHERE workoutExerciseId = ? ORDER BY position
    `,
        [entryId],
      )
      .map((set) => set.id);
    // Move retained rows aside before inserting, avoiding the unique (entry, position) constraint.
    const temporaryPositionOffset = order.length + refreshed.length;
    order.forEach((id, index) =>
      this.db.run('UPDATE workoutSet SET position = ? WHERE id = ?', [-(temporaryPositionOffset + index + 1), id]),
    );
    const warmupIds: number[] = [];
    for (const [index, suggestion] of refreshed.entries()) {
      let id = suggestion.id;
      if (id === null) {
        id = this.db.run(
          `
          INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, isCompleted)
          VALUES (?, ?, 'warmup', ?, ?, ?, 0)
        `,
          [entryId, index, suggestion.weightKilograms, exercise.defaultEntryUnit, suggestion.reps],
        ).lastInsertRowId;
        state.suggested.add(id);
      } else if (!state.edited.has(id) && !existing.some((set) => set.id === id && set.isCompleted === 1)) {
        this.db.run(
          `
          UPDATE workoutSet SET weightKilograms = ?, reps = ?, entryUnit = ? WHERE id = ?
        `,
          [suggestion.weightKilograms, suggestion.reps, exercise.defaultEntryUnit, id],
        );
        state.suggested.add(id);
      }
      warmupIds.push(id);
    }
    this.assignPositions([...warmupIds, ...order.filter((id) => !warmupIds.includes(id))], 'workoutSet');
  }

  /** Deleted imported source keys; malformed protection fails closed rather than resurrecting history. */
  static deletedSourceKeys(db: Database): ReadonlySet<string> {
    const value = db.value<string>('SELECT value FROM appSetting WHERE key = ?', [DELETED_SOURCE_KEYS]);
    if (value === undefined) return new Set();
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new PastWorkoutError('invalidDeletedKeys');
    }
    if (!Array.isArray(parsed) || !parsed.every((key: unknown) => typeof key === 'string'))
      throw new PastWorkoutError('invalidDeletedKeys');
    return new Set(parsed);
  }

  /** Rejects missing or live workouts before a History snapshot or write. */
  requireFinished(workoutId: number): void {
    this.requireWorkout(workoutId);
    if (this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [workoutId]) !== 0)
      throw new PastWorkoutError('notFinished');
  }

  /** Deletes only a finished workout tree, atomically preserving its import source key; caller snapshots first. */
  deleteFinished(workoutId: number): void {
    this.db.transaction(() => {
      this.requireFinished(workoutId);
      const sourceKey = this.db.value<string | null>('SELECT sourceKey FROM workout WHERE id = ?', [workoutId]);
      if (sourceKey !== undefined && sourceKey !== null) {
        const deleted = new Set(WorkoutLogger.deletedSourceKeys(this.db));
        deleted.add(sourceKey);
        this.db.run(
          `
          INSERT INTO appSetting (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
          [DELETED_SOURCE_KEYS, JSON.stringify([...deleted])],
        );
      }
      this.discard(workoutId);
    });
  }

  /** Saves one finished-workout field; changing start preserves elapsed duration and all import identity. */
  updateFinished(workoutId: number, change: FinishedWorkoutChange): void {
    this.db.transaction(() => {
      this.requireFinished(workoutId);
      const workout = this.db.get<{ name: string; notes: string | null; startedAt: string; endedAt: string | null }>(
        'SELECT name, notes, startedAt, endedAt FROM workout WHERE id = ?',
        [workoutId],
      );
      if (workout === undefined) throw new WorkoutLoggerError('workoutNotFound');
      if (change.field === 'name' || change.field === 'notes') {
        this.update(
          workoutId,
          change.field === 'name' ? change.value : workout.name,
          change.field === 'notes' ? change.value : workout.notes,
        );
        return;
      }
      const started = new Date(change.field === 'startedAt' ? change.value : workout.startedAt);
      const duration =
        change.field === 'durationSeconds'
          ? change.value
          : workout.endedAt === null
            ? null
            : (new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) /
              TIME_UNITS.millisecondsPerSecond;
      const ended =
        duration === null ? null : new Date(started.getTime() + duration * TIME_UNITS.millisecondsPerSecond);
      if (
        !Number.isFinite(started.getTime()) ||
        (duration !== null && (!Number.isFinite(duration) || duration < 0)) ||
        (ended !== null && !Number.isFinite(ended.getTime()))
      )
        throw new PastWorkoutError('invalidTime');
      this.db.run('UPDATE workout SET startedAt = ?, endedAt = ? WHERE id = ?', [
        started.toISOString(),
        ended?.toISOString() ?? null,
        workoutId,
      ]);
    });
  }

  /** Saves deload settings and, for live entries, removes only uncompleted working sets when possible. */
  setDeloadStage(entryId: number, stage: DeloadStage | null, settings?: DeloadSettings, targetSets?: number): void {
    this.db.transaction(() => {
      const entry = this.requireEntry(entryId);
      const mode = stage === null ? null : (settings?.mode ?? null);
      const loadPercent = stage === null ? null : (settings?.loadPercent ?? null);
      const setPercent = stage === null ? null : (settings?.setPercent ?? null);
      const saved = this.db.get<{ deloadSetPercent: number | null; deloadMode: string | null }>(
        'SELECT deloadSetPercent, deloadMode FROM workoutExercise WHERE id = ?',
        [entryId],
      );
      this.db.run(
        `UPDATE workoutExercise SET deloadStage = ?, deloadMode = ?, deloadLoadPercent = ?, deloadSetPercent = ?
         WHERE id = ?`,
        [stage, mode, loadPercent, setPercent, entryId],
      );
      const live = this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [entry.workoutId]) === 1;
      if (!live || stage !== 1 || (mode !== 'sets' && mode !== 'both')) return;
      const sets = this.db.all<{ id: number; isCompleted: number }>(
        `SELECT id, isCompleted FROM workoutSet
         WHERE workoutExerciseId = ? AND kind <> 'warmup' ORDER BY position DESC`,
        [entryId],
      );
      const previousPercent = saved?.deloadSetPercent ?? null;
      const previousMode = saved?.deloadMode ?? null;
      const baseline =
        previousPercent !== null && (previousMode === 'sets' || previousMode === 'both')
          ? Math.round(sets.length / (1 - previousPercent / 100))
          : sets.length;
      const keep = targetSets ?? DeloadPlan.keptSets(baseline, setPercent ?? undefined);
      const removeCount = Math.max(0, sets.length - keep);
      if (sets.filter((set) => set.isCompleted === 1).length > keep) return;
      const removable = sets.filter((set) => set.isCompleted === 0).slice(0, removeCount);
      for (const set of removable) this.db.run('DELETE FROM workoutSet WHERE id = ?', [set.id]);
      this.renumberSets(entryId);
    });
  }

  /** Saves or clears a normalized manufacturer for one workout entry. */
  setMachineBrand(entryId: number, brand: string | null): void {
    this.requireEntry(entryId);
    this.db.run('UPDATE workoutExercise SET machineBrand = ? WHERE id = ?', [
      brand === null ? null : normalizeMachineBrand(brand),
      entryId,
    ]);
  }

  /** Starts stage 1 for all current exercises atomically. */
  deloadWorkout(workoutId: number, settings?: DeloadSettings): void {
    this.db.transaction(() => {
      this.requireWorkout(workoutId);
      const entries = this.db.all<{ id: number }>('SELECT id FROM workoutExercise WHERE workoutId = ?', [workoutId]);
      for (const entry of entries) this.setDeloadStage(entry.id, 1, settings);
    });
  }

  private initializeDeload(entryId: number, hasTemplateSets = false): void {
    const entry = this.requireEntry(entryId);
    if (this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [entry.workoutId]) !== 1) return;
    const previous = previousExerciseEntry(this.db, entryId);
    const stage = DeloadPlan.nextStage(previous?.deloadStage ?? null, previous?.deloadMode ?? null);
    const settings =
      previous === undefined
        ? undefined
        : {
            mode: stage === 2 && previous.deloadMode === 'both' ? 'load' : (previous.deloadMode ?? null),
            loadPercent: previous.deloadLoadPercent ?? null,
            setPercent: previous.deloadSetPercent ?? null,
          };
    this.setDeloadStage(entryId, stage, settings);
    // After a set reduction, the next session (build-back or normal) starts again with the pre-cycle set count.
    if (
      !hasTemplateSets &&
      previous?.deloadStage === 1 &&
      (previous.deloadMode === 'sets' || previous.deloadMode === 'both')
    ) {
      const baselineCount = deloadBaseline(this.db, entryId, previous.machineBrand ?? null).filter(
        (set) => set.kind !== 'warmup',
      ).length;
      const count =
        this.db.value<number>("SELECT COUNT(*) FROM workoutSet WHERE workoutExerciseId = ? AND kind <> 'warmup'", [
          entryId,
        ]) ?? 0;
      for (let index = count; index < baselineCount; index += 1) {
        this.db.run(
          `INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, durationSeconds, side, isCompleted)
          SELECT workoutExerciseId, (SELECT COUNT(*) FROM workoutSet WHERE workoutExerciseId = ?), kind, weightKilograms, entryUnit, reps, NULL, durationSeconds, side, 0
          FROM workoutSet WHERE workoutExerciseId = ? AND kind <> 'warmup' ORDER BY position DESC LIMIT 1`,
          [entryId, entryId],
        );
      }
    }
  }

  /** Saves exercise notes; an empty string clears them without changing the exercise definition. */
  updateExerciseNotes(entryId: number, notes: string): void {
    this.db.transaction(() => {
      this.requireEntry(entryId);
      this.db.run('UPDATE workoutExercise SET notes = ? WHERE id = ?', [notes === '' ? null : notes, entryId]);
    });
  }

  /** Saves one set's notes; an empty string clears them and all performance fields stay intact. */
  updateSetNotes(setId: number, notes: string): void {
    if (this.db.run('UPDATE workoutSet SET notes = ? WHERE id = ?', [notes === '' ? null : notes, setId]).changes === 0)
      throw new WorkoutLoggerError('setNotFound');
  }

  /** The workout currently being logged, if any. */
  activeWorkoutId(): number | undefined {
    return this.db.value<number>('SELECT id FROM workout WHERE isInProgress = 1 ORDER BY startedAt DESC LIMIT 1');
  }

  /** Starts an empty workout at the given time; only one can be in progress. */
  start(name: string, now: Date): number {
    return this.db.transaction(() => {
      const active = this.activeWorkoutId();
      if (active !== undefined) throw new WorkoutLoggerError('workoutAlreadyInProgress', active);
      return this.db.run(`INSERT INTO workout (startedAt, name, source, isInProgress) VALUES (?, ?, 'app', 1)`, [
        now.toISOString(),
        name,
      ]).lastInsertRowId;
    });
  }

  /** Starts a template workout, using its set kinds and the latest performed values. */
  startFromTemplate(templateId: number, now: Date): number {
    return this.db.transaction(() => {
      const active = this.activeWorkoutId();
      if (active !== undefined) throw new WorkoutLoggerError('workoutAlreadyInProgress', active);
      const preview = workoutPreview(this.db, templateId, now);
      const workoutId = this.db.run(
        `
        INSERT INTO workout (startedAt, name, source, isInProgress, templateId) VALUES (?, ?, 'app', 1, ?)
        `,
        [preview.workout.startedAt, preview.workout.name, templateId],
      ).lastInsertRowId;
      for (const item of preview.entries) {
        const entry = item.entry;
        const entryId = this.db.run(
          `
          INSERT INTO workoutExercise (workoutId, exerciseId, position, supersetGroup, notes, machineBrand,
            deloadStage, deloadMode, deloadLoadPercent, deloadSetPercent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            workoutId,
            entry.exerciseId,
            entry.position,
            entry.supersetGroup,
            entry.notes,
            entry.machineBrand ?? null,
            entry.deloadStage ?? null,
            entry.deloadMode ?? null,
            entry.deloadLoadPercent ?? null,
            entry.deloadSetPercent ?? null,
          ],
        ).lastInsertRowId;
        const suggested = new Set<number>();
        const inherited = new Set<number>();
        for (const set of item.sets) {
          const id = this.db.run(
            `
            INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit,
              reps, rpe, durationSeconds, isCompleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            `,
            [
              entryId,
              set.position,
              set.kind,
              set.weightKilograms,
              set.entryUnit,
              set.reps,
              set.rpe,
              set.durationSeconds,
            ],
          ).lastInsertRowId;
          if (preview.suggestedWarmupSetIds.includes(set.id)) suggested.add(id);
          else if (set.kind === 'warmup') inherited.add(id);
        }
        // Warm-ups the template holds stay as placed: nothing is generated beside them.
        this.warmupState.set(entryId, {
          edited: inherited,
          suggested,
          suppressed: inherited.size > 0,
        });
      }
      return workoutId;
    });
  }

  /** Drops planned sets and ends the workout. Repeating a finish never changes finished data; missing ids are a no-op. */
  finish(workoutId: number, now: Date): FinishResult {
    return this.db.transaction(() => {
      const workout = this.db.get<{ isInProgress: number }>('SELECT isInProgress FROM workout WHERE id = ?', [
        workoutId,
      ]);
      if (workout === undefined) return { workoutId: null, completedSets: 0, droppedSets: 0 };
      if (workout.isInProgress === 0) {
        const completedSets =
          this.db.value<number>(
            `
          SELECT COUNT(*) FROM workoutSet s
          JOIN workoutExercise entry ON entry.id = s.workoutExerciseId
          WHERE entry.workoutId = ? AND s.isCompleted = 1
        `,
            [workoutId],
          ) ?? 0;
        return { workoutId, completedSets, droppedSets: 0 };
      }
      const droppedSets = this.db.run(
        `
        DELETE FROM workoutSet WHERE isCompleted = 0
        AND workoutExerciseId IN (SELECT id FROM workoutExercise WHERE workoutId = ?)
      `,
        [workoutId],
      ).changes;
      this.db.run(
        `
        DELETE FROM workoutExercise WHERE workoutId = ?
        AND id NOT IN (SELECT workoutExerciseId FROM workoutSet)
      `,
        [workoutId],
      );
      const completedSets =
        this.db.value<number>(
          `
        SELECT COUNT(*) FROM workoutSet s JOIN workoutExercise we ON we.id = s.workoutExerciseId
        WHERE we.workoutId = ?
      `,
          [workoutId],
        ) ?? 0;
      if (completedSets === 0) {
        this.db.run('DELETE FROM workout WHERE id = ?', [workoutId]);
        return { workoutId: null, completedSets, droppedSets };
      }
      this.renumberExercises(workoutId);
      const entries = this.db.all<{ id: number }>('SELECT id FROM workoutExercise WHERE workoutId = ?', [workoutId]);
      for (const entry of entries) this.renumberSets(entry.id);
      this.db.run('UPDATE workout SET endedAt = ?, isInProgress = 0 WHERE id = ?', [now.toISOString(), workoutId]);
      this.db.run(
        `UPDATE template SET lastStartedAt = (SELECT startedAt FROM workout WHERE id = ?)
         WHERE id = (SELECT templateId FROM workout WHERE id = ?)`,
        [workoutId, workoutId],
      );
      return { workoutId, completedSets, droppedSets };
    });
  }

  /** Deletes a workout and its exercises and sets. */
  discard(workoutId: number): void {
    this.db.transaction(() => {
      if (this.db.run('DELETE FROM workout WHERE id = ?', [workoutId]).changes === 0)
        throw new WorkoutLoggerError('workoutNotFound');
    });
  }

  /** Renames a workout and changes its notes; empty notes become null. */
  update(workoutId: number, name: string, notes: string | null): void {
    this.db.transaction(() => {
      this.requireWorkout(workoutId);
      this.db.run('UPDATE workout SET name = ?, notes = ? WHERE id = ?', [
        name,
        notes === '' ? null : notes,
        workoutId,
      ]);
    });
  }

  /** Appends an exercise copied from last session, or one empty set; live sets are planned, historical sets performed. */
  addExercise(exerciseId: number, workoutId: number): number {
    return this.db.transaction(() => {
      this.requireWorkout(workoutId);
      const completed =
        this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [workoutId]) === 0 ? 1 : 0;
      const exercise = this.db.get<{ defaultEntryUnit: WeightUnit }>(
        'SELECT defaultEntryUnit FROM exercise WHERE id = ?',
        [exerciseId],
      );
      if (exercise === undefined) throw new WorkoutLoggerError('exerciseNotFound');
      const position =
        this.db.value<number>('SELECT COUNT(*) FROM workoutExercise WHERE workoutId = ?', [workoutId]) ?? 0;
      const brand = latestMachineBrand(this.db, exerciseId, workoutId);
      const entryId = this.db.run(
        'INSERT INTO workoutExercise (workoutId, exerciseId, position, machineBrand) VALUES (?, ?, ?, ?)',
        [workoutId, exerciseId, position, brand],
      ).lastInsertRowId;
      const occurrence =
        (this.db.value<number>('SELECT COUNT(*) FROM workoutExercise WHERE workoutId = ? AND exerciseId = ?', [
          workoutId,
          exerciseId,
        ]) ?? 1) - 1;
      const previous =
        brand === null
          ? previousPerformance(this.db, exerciseId, workoutId)
          : machinePreviousPerformance(this.db, exerciseId, workoutId, null, occurrence, brand).sets;
      if (previous.length === 0) {
        this.db.run(
          `INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, isCompleted) VALUES (?, 0, 'working', 0, ?, 0, ?)`,
          [entryId, exercise.defaultEntryUnit, completed],
        );
      } else {
        previous.forEach((set, index) => {
          this.db.run(
            `
            INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, durationSeconds, side, isCompleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              entryId,
              index,
              set.kind,
              set.weightKilograms,
              exercise.defaultEntryUnit,
              set.reps,
              set.rpe,
              set.durationSeconds,
              set.side,
              completed,
            ],
          );
        });
      }
      this.initializeDeload(entryId);
      this.initializeWarmups(entryId);
      return entryId;
    });
  }

  /** Removes an exercise and its sets, closing the position gap. */
  removeExercise(entryId: number): void {
    this.db.transaction(() => {
      const entry = this.requireEntry(entryId);
      this.db.run('DELETE FROM workoutExercise WHERE id = ?', [entryId]);
      this.warmupState.delete(entryId);
      this.renumberExercises(entry.workoutId);
    });
  }

  /** Moves an exercise to a clamped zero-based position. */
  moveExercise(entryId: number, newPosition: number): void {
    this.db.transaction(() => {
      const entry = this.requireEntry(entryId);
      const order = this.db
        .all<{ id: number }>('SELECT id FROM workoutExercise WHERE workoutId = ? ORDER BY position', [entry.workoutId])
        .map((row) => row.id)
        .filter((id) => id !== entryId);
      order.splice(Math.min(Math.max(0, newPosition), order.length), 0, entryId);
      this.assignPositions(order, 'workoutExercise');
    });
  }

  /** Appends a set copying the last; historical additions are performed, live additions planned, warm-ups become working. */
  addSet(entryId: number, kind: 'working' | 'warmup' = 'working'): number {
    return this.db.transaction(() => {
      const entry = this.requireEntry(entryId);
      const exercise = this.db.get<{ defaultEntryUnit: WeightUnit }>(
        'SELECT defaultEntryUnit FROM exercise WHERE id = ?',
        [entry.exerciseId],
      );
      if (exercise === undefined) throw new WorkoutLoggerError('exerciseNotFound');
      const last = this.db.get<WorkoutSetRow>(
        'SELECT * FROM workoutSet WHERE workoutExerciseId = ? AND kind = ? ORDER BY position DESC LIMIT 1',
        [entryId, kind],
      );
      const id = this.db.run(
        `
        INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, durationSeconds, side, isCompleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          entryId,
          (this.db.value<number>('SELECT MAX(position) FROM workoutSet WHERE workoutExerciseId = ?', [entryId]) ?? -1) +
            1,
          kind,
          last?.weightKilograms ?? 0,
          last?.entryUnit ?? exercise.defaultEntryUnit,
          last?.reps ?? 0,
          last?.durationSeconds ?? null,
          last?.side ?? 'both',
          this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [entry.workoutId]) === 0 ? 1 : 0,
        ],
      ).lastInsertRowId;
      if (kind === 'warmup') {
        this.warmupStateFor(entryId).edited.add(id);
        const order = this.db.all<{ id: number; kind: SetKind }>(
          'SELECT id, kind FROM workoutSet WHERE workoutExerciseId = ? ORDER BY position',
          [entryId],
        );
        this.assignPositions(
          [...order.filter((set) => set.kind === 'warmup'), ...order.filter((set) => set.kind !== 'warmup')].map(
            (set) => set.id,
          ),
          'workoutSet',
        );
      }
      if (kind === 'working') this.refreshEntryWarmups(entryId);
      return id;
    });
  }

  /** Updates kg load, typed unit, reps, RPE, kind and duration in seconds (null or finite and nonnegative). */
  updateSet(
    setId: number,
    weightKilograms: number,
    entryUnit: WeightUnit,
    reps: number,
    rpe: number | null,
    kind: SetKind,
    durationSeconds: number | null = null,
  ): void {
    if (!(weightKilograms >= 0 && weightKilograms <= WorkoutLoggerLimits.maximumKilograms))
      throw new WorkoutLoggerError('invalidWeight', weightKilograms);
    if (!Number.isInteger(reps) || reps < 0 || reps > WorkoutLoggerLimits.maximumReps)
      throw new WorkoutLoggerError('invalidReps', reps);
    if (rpe !== null && !(rpe >= WorkoutLoggerLimits.rpeRange.minimum && rpe <= WorkoutLoggerLimits.rpeRange.maximum))
      throw new WorkoutLoggerError('invalidRPE', rpe);
    if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 0))
      throw new WorkoutLoggerError('invalidDuration', durationSeconds);
    this.db.transaction(() => {
      const original = this.db.get<WorkoutSetRow>('SELECT * FROM workoutSet WHERE id = ?', [setId]);
      if (original === undefined) throw new WorkoutLoggerError('setNotFound');
      const warmupState = this.warmupStateFor(original.workoutExerciseId);
      if (
        this.db.run(
          `
        UPDATE workoutSet SET weightKilograms = ?, entryUnit = ?, reps = ?, rpe = ?, kind = ?, durationSeconds = ? WHERE id = ?
      `,
          [weightKilograms, entryUnit, reps, rpe, kind, durationSeconds, setId],
        ).changes === 0
      )
        throw new WorkoutLoggerError('setNotFound');
      if ((original.kind === 'warmup') !== (kind === 'warmup')) {
        const rows = this.db.all<{ id: number; kind: SetKind }>(
          'SELECT id, kind FROM workoutSet WHERE workoutExerciseId = ? AND id <> ? ORDER BY position',
          [original.workoutExerciseId, setId],
        );
        const boundary = rows.filter((row) => row.kind === 'warmup').length;
        rows.splice(boundary, 0, { id: setId, kind });
        this.assignPositions(
          rows.map((row) => row.id),
          'workoutSet',
        );
      }
      if (original.kind === 'warmup' || kind === 'warmup') {
        const state = warmupState;
        if (original.weightKilograms !== weightKilograms || original.reps !== reps || original.kind !== kind) {
          state?.edited.add(setId);
          state?.suggested.delete(setId);
        }
      }
      if (original.kind !== kind || (kind !== 'warmup' && original.weightKilograms !== weightKilograms)) {
        this.refreshEntryWarmups(original.workoutExerciseId);
      }
    });
  }

  /** Live: changes the default and planned units. History: changes only this entry's units. Kilograms stay exact. */
  setEntryUnit(unit: WeightUnit, entryId: number): void {
    this.db.transaction(() => {
      const entry = this.requireEntry(entryId);
      const finished = this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [entry.workoutId]) === 0;
      if (!finished) this.db.run('UPDATE exercise SET defaultEntryUnit = ? WHERE id = ?', [unit, entry.exerciseId]);
      this.db.run(
        `
        UPDATE workoutSet SET entryUnit = ? WHERE workoutExerciseId = ? ${finished ? '' : 'AND isCompleted = 0'}
      `,
        [unit, entryId],
      );
      this.refreshEntryWarmups(entryId);
    });
  }

  /** Sets completion, recording time and rest in seconds only when the state changes; repeated requests are a no-op. */
  setCompleted(setId: number, completed: boolean, now: Date): void {
    this.db.transaction(() => {
      const set = this.db.get<{ workoutId: number; isCompleted: number }>(
        `
        SELECT we.workoutId, s.isCompleted
        FROM workoutSet s
        JOIN workoutExercise we ON we.id = s.workoutExerciseId
        WHERE s.id = ?
      `,
        [setId],
      );
      if (set === undefined) throw new WorkoutLoggerError('setNotFound');
      if (set.isCompleted === Number(completed)) return;
      const previous = completed
        ? this.db.value<string | null>(
            `
        SELECT MAX(s.completedAt) FROM workoutSet s JOIN workoutExercise we ON we.id = s.workoutExerciseId
        WHERE we.workoutId = ? AND s.isCompleted = 1 AND s.id <> ?
      `,
            [set.workoutId, setId],
          )
        : null;
      const rest =
        previous === null || previous === undefined ? null : (now.getTime() - new Date(previous).getTime()) / 1000;
      this.db.run('UPDATE workoutSet SET isCompleted = ?, completedAt = ?, restBeforeSeconds = ? WHERE id = ?', [
        completed ? 1 : 0,
        completed ? now.toISOString() : null,
        rest,
        setId,
      ]);
    });
  }

  /** Deletes a set and closes the gap in positions. */
  deleteSet(setId: number): void {
    this.db.transaction(() => {
      const set = this.db.get<{ workoutExerciseId: number; kind: SetKind }>(
        'SELECT workoutExerciseId, kind FROM workoutSet WHERE id = ?',
        [setId],
      );
      if (set === undefined) throw new WorkoutLoggerError('setNotFound');
      this.db.run('DELETE FROM workoutSet WHERE id = ?', [setId]);
      const entry = this.requireEntry(set.workoutExerciseId);
      const finished = this.db.value<number>('SELECT isInProgress FROM workout WHERE id = ?', [entry.workoutId]) === 0;
      const remainingSets = this.db.value<number>('SELECT COUNT(*) FROM workoutSet WHERE workoutExerciseId = ?', [
        set.workoutExerciseId,
      ]);
      if (finished && remainingSets === 0) {
        this.removeExercise(set.workoutExerciseId);
        return;
      }
      this.renumberSets(set.workoutExerciseId);
      if (set.kind === 'warmup') {
        const state = this.warmupState.get(set.workoutExerciseId);
        state?.suggested.delete(setId);
        state?.edited.delete(setId);
        const remaining =
          this.db.value<number>(
            `
          SELECT COUNT(*) FROM workoutSet WHERE workoutExerciseId = ? AND kind = 'warmup'
        `,
            [set.workoutExerciseId],
          ) ?? 0;
        if (remaining === 0)
          this.warmupState.set(set.workoutExerciseId, {
            edited: new Set(),
            suggested: new Set(),
            suppressed: true,
          });
      } else {
        this.refreshEntryWarmups(set.workoutExerciseId);
      }
    });
  }

  private requireWorkout(workoutId: number): void {
    if (this.db.value<number>('SELECT id FROM workout WHERE id = ?', [workoutId]) === undefined)
      throw new WorkoutLoggerError('workoutNotFound');
  }

  private requireEntry(entryId: number): { workoutId: number; exerciseId: number } {
    const entry = this.db.get<{ workoutId: number; exerciseId: number }>(
      'SELECT workoutId, exerciseId FROM workoutExercise WHERE id = ?',
      [entryId],
    );
    if (entry === undefined) throw new WorkoutLoggerError('exerciseNotFound');
    return entry;
  }

  private renumberExercises(workoutId: number): void {
    const order = this.db
      .all<{ id: number }>('SELECT id FROM workoutExercise WHERE workoutId = ? ORDER BY position', [workoutId])
      .map((row) => row.id);
    this.assignPositions(order, 'workoutExercise');
  }

  private renumberSets(entryId: number): void {
    const order = this.db
      .all<{ id: number }>('SELECT id FROM workoutSet WHERE workoutExerciseId = ? ORDER BY position', [entryId])
      .map((row) => row.id);
    this.assignPositions(order, 'workoutSet');
  }

  private assignPositions(order: readonly number[], table: 'workoutExercise' | 'workoutSet'): void {
    order.forEach((id, index) => this.db.run(`UPDATE ${table} SET position = ? WHERE id = ?`, [-(index + 1), id]));
    order.forEach((id, index) => this.db.run(`UPDATE ${table} SET position = ? WHERE id = ?`, [index, id]));
  }
}
