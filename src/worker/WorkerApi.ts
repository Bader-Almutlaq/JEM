import { TemplateAnalytics } from '../core/queries/TemplateAnalytics';
import { ExerciseProgress } from '../core/queries/ExerciseProgress';
import { liftRpeChart, rtsRpeChart } from '../core/analytics/RpeChart';
import { loadProfileFor } from '../core/units/LoadableWeight';
import { PinnedExercises } from '../core/analytics/PinnedExercises';
import { WeeklyEffort } from '../core/queries/WeeklyEffort';
import { MuscleDashboard, MuscleDetail } from '../core/queries/MuscleDashboard';
import { medianLiftChange } from '../core/queries/LiftTrends';
import { templateMuscleSummary } from '../core/queries/TemplateMuscleSummary';
import { TrainingSummary } from '../core/queries/TrainingSummary';
import { LiftTrends } from '../core/queries/LiftTrends';
import { intensityMix } from '../core/queries/IntensityMix';
import { usedMachineBrands } from '../core/queries/PreviousPerformance';
import type { DeloadSettings, DeloadStage } from '../core/logging/DeloadPlan';
import { ExerciseSeries } from '../core/queries/ExerciseSeries';
import { RepMaxTable } from '../core/queries/RepMaxTable';
import type { WorkoutFileFormat } from '../core/import/formats/detectWorkoutFileFormat';
import { exportStrongCsv } from '../core/export/StrongCsvExport';
import { exportMeasurementsCsv } from '../core/export/MeasurementsCsvExport';
import type { Database } from '../core/db/Database';
import { personalBestsForWorkout, personalBestCounts } from '../core/queries/PersonalBests';
import { workoutComparison } from '../core/queries/WorkoutComparison';
import { MeasurementQueries } from '../core/measurements/MeasurementQueries';
import {
  MeasurementStore,
  type MeasurementDraft,
  type MeasurementSiteDraft,
} from '../core/measurements/MeasurementStore';
import { measurementUnits, type MeasurementUnits } from '../core/measurements/MeasurementUnits';
import { log } from '../core/support/log';
import type { Muscle } from '../core/library/Muscle';
import { weeklyMuscleVolume, type WeeklyMuscleVolume } from '../core/queries/WeeklyMuscleVolume';
import { workoutDaysInMonth, type WorkoutCalendarDay } from '../core/queries/WorkoutCalendar';
import { ExerciseStrength, type ExerciseStrengthSeries } from '../core/queries/ExerciseStrength';
import { CsvTable } from '../core/import/CsvTable';
import { makeStrongImportPlan, type StrongImportPlan } from '../core/import/StrongImportPlan';
import { makeImportOptions, type StrongImportOptions } from '../core/import/StrongImportOptions';
import { importStrongPlan, strongImportWorkoutCounts, type ImportResult } from '../core/import/StrongImporter';
import {
  isStrongMeasurementsFile,
  parseStrongMeasurementsFile,
  type PlannedMeasurement,
} from '../core/import/StrongMeasurementsFile';
import { parseStrongWorkoutsFile } from '../core/import/StrongWorkoutsFile';
import { detectWorkoutFileFormat } from '../core/import/formats/detectWorkoutFileFormat';
import { parseHevyWorkoutsFile } from '../core/import/formats/HevyWorkoutsFile';
import { parseFitNotesWorkoutsFile } from '../core/import/formats/FitNotesWorkoutsFile';
import { parseFitbodWorkoutsFile } from '../core/import/formats/FitbodWorkoutsFile';
import { ImportError } from '../core/import/ImportError';
import type { StrongRow } from '../core/import/StrongRow';
import * as Comlink from 'comlink';
import { backupFileName } from '../core/backup/BackupFile';
import { validateBackup } from '../core/backup/BackupValidation';
import { AppSettingKey, getSetting, setSetting } from '../core/db/AppSetting';
import type { OnDeviceStore, OpenReport } from './OnDeviceStore';
import type { CustomExerciseDraft } from '../core/library/CustomExerciseDraft';
import type { ExerciseLoadingSettings } from '../core/library/ExerciseEditor';
import { ExerciseEditor } from '../core/library/ExerciseEditor';
import { ExerciseLibrary } from '../core/library/ExerciseLibrary';
import type { ExerciseSearchEntry } from '../core/library/ExerciseSearch';
import {
  ExerciseCatalog,
  type ExerciseCatalogDetail,
  type ExerciseCatalogUnmatchedImport,
} from '../core/queries/ExerciseCatalog';
import {
  workoutDetail,
  workoutSummaries,
  workoutSummary,
  type WorkoutDetail,
  type WorkoutSummary,
} from '../core/queries/WorkoutHistory';
import { setRestTarget } from '../core/logging/RestTimer';
import { WorkoutLogger, type FinishedWorkoutChange, type FinishResult } from '../core/logging/WorkoutLogger';
import type { SetKind } from '../core/models/SetKind';
import { liveWorkoutSnapshot, type LiveWorkoutSnapshot } from '../core/queries/LiveWorkout';
import { TemplateSessions, type TemplateSessionScope } from '../core/queries/TemplateSessions';
import { TemplateCatalog, type TemplateList } from '../core/queries/TemplateCatalog';
import type { TemplateDraft, TemplateSetDraft } from '../core/templates/TemplateDraft';
import { TemplateStore } from '../core/templates/TemplateStore';
import type { WeightUnit } from '../core/units/WeightUnit';
import { liveSetFinding as checkLiveSet } from '../core/validation/LiveSetCheck';
import type { SetFinding } from '../core/validation/SetPlausibility';

/** Called after any write, so screens can re-run their queries. */
export type ChangeListener = () => void | Promise<void>;

/** Basic facts about the database, shown in Settings. */
export interface DatabaseSummary {
  readonly workoutCount: number;
  readonly exerciseCount: number;
  readonly snapshotCount: number;
  readonly openReport: OpenReport;
}

/** A complete copy of the database, ready to be saved as a file. */
export interface BackupExport {
  /** `WorkoutTracker-YYYY-MM-DDTHH-mm-ss.sqlite`, named for the moment it was made. */
  readonly fileName: string;
  /** The whole database as one SQLite file. */
  readonly bytes: Uint8Array;
  /** Monotonic write revision in this worker; guards clearing a retry after changes during an upload. */
  readonly changeVersion: number;
}

// Dropbox backup (T-042)
/** Non-secret cloud backup metadata stored in appSetting; tokens never cross the worker boundary. */
export interface CloudBackupSettings {
  readonly provider: 'dropbox' | null;
  readonly lastCloudBackupAt: string | undefined;
  readonly pending: boolean;
}

/** Partial metadata update; null clears the cloud timestamp without clearing the manual backup date. */
export interface CloudBackupSettingsUpdate {
  readonly provider?: 'dropbox' | null;
  readonly lastCloudBackupAt?: string | null;
  readonly pending?: boolean;
  /** Clear pending only if no database write has occurred since this export; omitted for explicit disconnect. */
  readonly completedExportVersion?: number;
}

/** T-042 setting names live here because the task does not own core/db/AppSetting.ts. */
const DropboxBackupSetting = {
  provider: 'cloudBackupProvider',
  lastBackupAt: 'lastCloudBackupAt',
  pending: 'cloudBackupPending',
} as const;

/** What a restore did, for the screen to report. */
export interface RestoreResult {
  /** Name of the safety snapshot holding the data as it was before the restore. */
  readonly snapshotName: string;
  /** Finished workouts in the restored data. */
  readonly workoutCount: number;
}

/** A review cannot proceed without a valid, unambiguous selection. */
class StrongImportFlowError extends Error {
  override readonly name = 'StrongImportFlowError';
  readonly kind = 'invalidSelection';
}

/** A snapshot failure must block destructive History actions and explain how to retry. */
class HistorySnapshotError extends Error {
  override readonly name = 'HistorySnapshotError';
  readonly kind = 'snapshotFailed';
  constructor() {
    super('Could not keep a safety copy. No changes were made. Free some space on this phone and try again.');
  }
}

async function takeHistorySnapshot(store: OnDeviceStore): Promise<void> {
  try {
    await store.takeSnapshot();
  } catch (error) {
    log.database.error('History safety snapshot failed', error);
    throw new HistorySnapshotError();
  }
}

/**
 * Everything the screen can ask of the database. Each method maps to one WorkoutCore call.
 *
 * Conventions for adding a method:
 * - Reads return plain data (no class instances), because results are copied between threads.
 * - Writes notify every listener once they succeed (`notifyListeners()`), so every open screen refreshes.
 * - Errors are thrown as-is; the app shows their message to the owner.
 * - Get the store with `await liveStore()` and read `store.database` straight after it, never keeping
 *   the database across an `await`: a restore swaps the connection.
 */
export function createWorkerApi(ready: Promise<OnDeviceStore>) {
  // Warm-ups (T-044): provenance has the same lifetime as the database connection.
  const loggers = new WeakMap<Database, WorkoutLogger>();
  const workoutLogger = (db: Database): WorkoutLogger => {
    let logger = loggers.get(db);
    if (logger === undefined) {
      logger = new WorkoutLogger(db);
      loggers.set(db, logger);
    }
    return logger;
  };
  const listeners = new Map<number, ChangeListener>();
  let nextSubscriptionId = 1;
  let importRows: StrongRow[] = [];
  let importMeasurements: PlannedMeasurement[] = [];
  let importPlan: StrongImportPlan | undefined;

  let requests: Promise<void> = Promise.resolve();
  let changeVersion = 0;

  /** A request includes its snapshot/restore awaits; later reads and writes cannot overtake it. */
  const serially =
    <Arguments extends readonly unknown[], Result>(
      operation: (...arguments_: Arguments) => Promise<Result>,
    ): ((...arguments_: Arguments) => Promise<Result>) =>
    (...arguments_) => {
      const result = requests.then(() => operation(...arguments_));
      // The internal tail settles on failure; the original rejection still goes back to the caller.
      requests = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };

  const notifyListeners = () => {
    changeVersion += 1;
    for (const listener of listeners.values()) {
      try {
        // Remote Comlink callbacks return promises. A disconnected screen cannot undo a committed write.
        Promise.resolve(listener()).catch((error: unknown) => log.ui.error('A database change listener failed', error));
      } catch (error) {
        log.ui.error('A database change listener failed', error);
      }
    }
  };

  /** The open store, once any restore in progress has finished. */
  const liveStore = async (): Promise<OnDeviceStore> => {
    const store = await ready;
    await store.whenIdle();
    return store;
  };

  const mergeExercisePairs = async (pairs: readonly (readonly [number, number])[]): Promise<number> => {
    const store = await liveStore();
    await store.takeSnapshot();
    const moved = ExerciseEditor.mergeAll(store.database, new Map(pairs));
    notifyListeners();
    return moved;
  };

  return {
    /** Resolves once the database is open and migrated; rejects with the reason it couldn't open. */
    whenReady: serially(async (): Promise<OpenReport> => {
      return (await ready).openReport;
    }),

    /**
     * Registers `listener` to run after every write and returns a subscription id for `unsubscribe`.
     * (An id rather than the listener itself, because a listener sent between threads arrives as a new object each time.)
     */
    subscribe(listener: ChangeListener): number {
      const id = nextSubscriptionId++;
      listeners.set(id, listener);
      return id;
    },

    unsubscribe(subscriptionId: number): void {
      listeners.delete(subscriptionId);
    },

    summary: serially(async (): Promise<DatabaseSummary> => {
      const store = await liveStore();
      const db = store.database;
      return {
        workoutCount: db.value<number>('SELECT count(*) FROM workout WHERE isInProgress = 0') ?? 0,
        exerciseCount: db.value<number>('SELECT count(*) FROM exercise WHERE isArchived = 0') ?? 0,
        snapshotCount: store.snapshotNames().length,
        openReport: store.openReport,
      };
    }),

    // Plans and workouts (T-058)

    /** Finished sessions, completed work totals and per-workout duration means for one workout or current plan. */
    templateSessions: serially(async (scope: TemplateSessionScope) => {
      return TemplateSessions.read((await liveStore()).database, scope);
    }),

    // End of Plans and workouts (T-058)

    // Measurements (T-043)

    /** Ordered groups with latest relaxed/flexed values and changes, plus display preferences. */
    measurementSites: serially(async () => {
      const db = (await liveStore()).database;
      return { groups: MeasurementQueries.list(db), units: measurementUnits(db) };
    }),

    /** A site's complete history, or null if it no longer exists. */
    measurementDetail: serially(async (key: string) => {
      return MeasurementQueries.detail((await liveStore()).database, key);
    }),

    /** Logs or edits one measurement in the supplied entry unit, defaulting to now. */
    saveMeasurement: serially(async (draft: MeasurementDraft): Promise<number> => {
      const id = MeasurementStore.save((await liveStore()).database, draft);
      notifyListeners();
      return id;
    }),

    /** Deletes one measurement. */
    deleteMeasurement: serially(async (id: number): Promise<void> => {
      MeasurementStore.delete((await liveStore()).database, id);
      notifyListeners();
    }),

    /** Replaces a site's how-to note verbatim. */
    updateMeasurementGuide: serially(async (key: string, guide: string): Promise<void> => {
      MeasurementStore.updateGuide((await liveStore()).database, key, guide);
      notifyListeners();
    }),

    /** Adds a custom length/mass site and returns its stable key. */
    addMeasurementSite: serially(async (draft: MeasurementSiteDraft): Promise<string> => {
      const key = MeasurementStore.addSite((await liveStore()).database, draft);
      notifyListeners();
      return key;
    }),

    /** Remembers body display units without rewriting measurements. */
    setMeasurementUnits: serially(async (units: MeasurementUnits): Promise<void> => {
      MeasurementStore.setUnits((await liveStore()).database, units);
      notifyListeners();
    }),
    // End of Measurements (T-043)

    // Analytics (T-035)

    /** Fractional hard sets for each local week in the inclusive date range. */
    weeklyMuscleVolume: serially(async (from: string, to: string): Promise<WeeklyMuscleVolume[]> => {
      return weeklyMuscleVolume((await liveStore()).database, new Date(from), new Date(to));
    }),

    // Dropbox backup (T-042)

    /** Read only non-secret cloud metadata. Connection credentials stay on this phone outside SQLite. */
    cloudBackupSettings: serially(async (): Promise<CloudBackupSettings> => {
      const db = (await liveStore()).database;
      const read = (key: string) =>
        db.value<string>(
          `
        SELECT value FROM appSetting WHERE key = ?
      `,
          [key],
        );
      return {
        provider: read(DropboxBackupSetting.provider) === 'dropbox' ? 'dropbox' : null,
        lastCloudBackupAt: read(DropboxBackupSetting.lastBackupAt),
        pending: read(DropboxBackupSetting.pending) === 'true',
      };
    }),

    /** Update metadata atomically. A successful upload also satisfies the existing manual backup reminder. */
    updateCloudBackupSettings: serially(async (change: CloudBackupSettingsUpdate): Promise<void> => {
      const db = (await liveStore()).database;
      db.transaction(() => {
        const write = (key: string, value: string | null) => {
          if (value === null) {
            db.run(
              `
              DELETE FROM appSetting WHERE key = ?
            `,
              [key],
            );
          } else {
            db.run(
              `
              INSERT INTO appSetting (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `,
              [key, value],
            );
          }
        };
        if (change.provider !== undefined) write(DropboxBackupSetting.provider, change.provider);
        if (
          change.pending !== undefined &&
          (change.pending ||
            change.completedExportVersion === undefined ||
            change.completedExportVersion === changeVersion)
        ) {
          write(DropboxBackupSetting.pending, String(change.pending));
        }
        if (change.lastCloudBackupAt !== undefined) {
          write(DropboxBackupSetting.lastBackupAt, change.lastCloudBackupAt);
          if (change.lastCloudBackupAt !== null) setSetting(db, AppSettingKey.lastBackupAt, change.lastCloudBackupAt);
        }
      });
      notifyListeners();
    }),

    // Export (T-048)
    /** Strong-compatible CSV of finished workouts and completed sets. */
    exportWorkoutsCsv: serially(async (): Promise<string> => exportStrongCsv((await ready).database)),

    /** CSV of all body measurements in their stored units. */
    exportMeasurementsCsv: serially(async (): Promise<string> => exportMeasurementsCsv((await ready).database)),

    // Backup (T-016)

    /**
     * A complete copy of the database and the file name to save it under. The copy is checked the
     * way a restore would check it, so the owner is never handed a backup that can't be restored.
     * The bytes are moved to the caller, not copied.
     */
    exportBackup: serially(async (): Promise<BackupExport> => {
      const store = await liveStore();
      const bytes = store.database.exportBytes();
      await validateBackup(bytes);
      return Comlink.transfer({ fileName: backupFileName(new Date()), bytes, changeVersion }, [bytes.buffer]);
    }),

    /** ISO time of the last backup the owner completed, or `undefined` if none yet. */
    lastBackupAt: serially(async (): Promise<string | undefined> => {
      const store = await liveStore();
      return getSetting(store.database, AppSettingKey.lastBackupAt);
    }),

    /** Records that a backup was just saved. Call only after the share sheet or download succeeded. */
    recordBackupMade: serially(async (): Promise<void> => {
      const store = await liveStore();
      setSetting(store.database, AppSettingKey.lastBackupAt, new Date().toISOString());
      notifyListeners();
    }),

    /**
     * Replaces all current data with a backup file (see `OnDeviceStore.restore`): checks the file,
     * keeps a safety snapshot, swaps the data, then refreshes every open screen.
     * Throws a `BackupError` whose message says what happened to the data.
     */
    restoreBackup: serially(async (bytes: Uint8Array): Promise<RestoreResult> => {
      const store = await liveStore();
      // "Last backup" describes this phone, not the file: keep it across the restore.
      const lastBackupAt = getSetting(store.database, AppSettingKey.lastBackupAt);
      const report = await store.restore(bytes);
      if (lastBackupAt !== undefined) setSetting(store.database, AppSettingKey.lastBackupAt, lastBackupAt);
      notifyListeners();
      return {
        snapshotName: report.snapshotName,
        workoutCount: store.database.value<number>('SELECT count(*) FROM workout WHERE isInProgress = 0') ?? 0,
      };
    }),

    // T-039
    /** Counts existing and new planned Strong workouts before import. */
    strongImportWorkoutCounts: serially(
      async (workouts: readonly import('../core/import/StrongImportPlan').PlannedWorkout[]) =>
        strongImportWorkoutCounts((await liveStore()).database, workouts),
    ),

    // Strong import (T-017)

    /** Parses selected CSVs and builds a review plan without writing to the database. */
    planStrongImport: serially(
      async (
        files: readonly { readonly name: string; readonly text: string }[],
        expectedFormat: Exclude<WorkoutFileFormat, 'unknown'> = 'strong',
      ): Promise<StrongImportPlan> => {
        await liveStore();
        importPlan = undefined;
        const rows: StrongRow[] = [];
        const measurements: PlannedMeasurement[] = [];
        let workoutsFileSelected = false;
        for (const file of files) {
          if (isStrongMeasurementsFile(CsvTable.parse(file.text))) {
            if (expectedFormat !== 'strong')
              throw new StrongImportFlowError('Measurement files can only be imported from Strong.');
            measurements.push(...parseStrongMeasurementsFile(file.text));
          } else {
            if (workoutsFileSelected)
              throw new StrongImportFlowError(
                'Choose only one workouts file at a time, along with any measurement files.',
              );
            const format = detectWorkoutFileFormat(file.text);
            if (format !== 'unknown' && format !== expectedFormat) {
              throw new ImportError({ kind: 'wrongWorkoutFile', expected: expectedFormat, detected: format });
            }
            switch (format) {
              case 'strong':
                rows.push(...parseStrongWorkoutsFile(file.text));
                break;
              case 'hevy':
                rows.push(...parseHevyWorkoutsFile(file.text));
                break;
              case 'fitnotes':
                rows.push(...parseFitNotesWorkoutsFile(file.text));
                break;
              case 'fitbod':
                rows.push(...parseFitbodWorkoutsFile(file.text));
                break;
              case 'unknown':
                throw new ImportError({ kind: 'unsupportedWorkoutFile' });
            }
            workoutsFileSelected = true;
          }
        }
        if (rows.length === 0 && measurements.length === 0)
          throw new StrongImportFlowError('No workouts or measurements were found in the chosen files.');
        importRows = rows;
        importMeasurements = measurements;
        importPlan = makeStrongImportPlan(rows, measurements);
        return importPlan;
      },
    ),

    /** Rebuilds the review after the owner changes a decision. */
    reviewStrongImport: serially(async (options: StrongImportOptions): Promise<StrongImportPlan> => {
      await liveStore();
      if (importPlan === undefined) throw new StrongImportFlowError('Choose files before reviewing the import.');
      importPlan = makeStrongImportPlan(importRows, importMeasurements, options);
      return importPlan;
    }),

    /** Takes a safety snapshot, then imports the chosen decisions and refreshes screens. */
    runStrongImport: serially(async (options: StrongImportOptions): Promise<ImportResult> => {
      const store = await liveStore();
      if (importPlan === undefined) throw new StrongImportFlowError('Choose files before importing.');
      const plan = makeStrongImportPlan(importRows, importMeasurements, makeImportOptions(options));
      await store.takeSnapshot();
      const result = importStrongPlan(store.database, plan, new Date());
      notifyListeners();
      return result;
    }),

    // Bests and comparison (T-045)
    /** Exercise records set in a finished workout. */
    personalBestsForWorkout: serially(async (workoutId: number) =>
      personalBestsForWorkout((await liveStore()).database, workoutId),
    ),
    /** Record counts for finished history. */
    personalBestCounts: serially(async () => personalBestCounts((await liveStore()).database)),
    /** Comparison with the previous matching finished workout. */
    workoutComparison: serially(async (workoutId: number) =>
      workoutComparison((await liveStore()).database, workoutId),
    ),

    // History (T-015)

    // History calendar (T-030)

    /** Local dates with finished workouts in a calendar month; month is 1–12. */
    workoutDaysInMonth: serially(async (year: number, month: number): Promise<WorkoutCalendarDay[]> => {
      const store = await liveStore();
      return workoutDaysInMonth(store.database, year, month);
    }),

    /** Every finished workout, newest first. */
    historySummaries: serially(async (): Promise<WorkoutSummary[]> => {
      return workoutSummaries((await liveStore()).database);
    }),

    /** One workout with its exercises and sets, or `undefined` when it doesn't exist. */
    workoutDetail: serially(async (workoutId: number): Promise<WorkoutDetail | undefined> => {
      return workoutDetail((await liveStore()).database, workoutId);
    }),
    // End of History (T-015)

    // Exercises (T-022)

    /** Every unarchived exercise as the search needs it, with aliases. The screen keeps these in memory and searches them. */
    exerciseEntries: serially(async (): Promise<ExerciseSearchEntry[]> => {
      return ExerciseCatalog.entries((await liveStore()).database, ExerciseLibrary.bundled());
    }),

    /** One exercise with its muscles, usage and recent sessions, or `null` when it doesn't exist. */
    exerciseDetail: serially(async (exerciseId: number): Promise<ExerciseCatalogDetail | null> => {
      return ExerciseCatalog.detail((await liveStore()).database, exerciseId, ExerciseLibrary.bundled());
    }),

    /** Exercises created by the Strong import that aren't linked to the library yet, most sets first. */
    unmatchedImports: serially(async (): Promise<ExerciseCatalogUnmatchedImport[]> => {
      return ExerciseCatalog.unmatchedImports((await liveStore()).database);
    }),

    /** Creates the owner's own exercise and returns its id. Throws an `ExerciseEditError` the screen shows as written. */
    createExercise: serially(async (draft: CustomExerciseDraft): Promise<number> => {
      const id = ExerciseEditor.create((await liveStore()).database, draft, new Date());
      notifyListeners();
      return id;
    }),

    /** Edits one of the owner's own exercises (or turns a Strong exercise into one). History is unchanged. */
    updateExercise: serially(async (exerciseId: number, draft: CustomExerciseDraft): Promise<void> => {
      ExerciseEditor.update((await liveStore()).database, exerciseId, draft);
      notifyListeners();
    }),

    /** Hides an exercise from search and pickers, or shows it again. History is kept. */
    setExerciseArchived: serially(async (exerciseId: number, isArchived: boolean): Promise<void> => {
      ExerciseEditor.setArchived((await liveStore()).database, exerciseId, isArchived);
      notifyListeners();
    }),

    /**
     * Moves one exercise's history to another and deletes the source (its name stays as an alias).
     * Takes a safety snapshot first. Returns how many logged exercise entries moved.
     */
    mergeExercise: serially(async (sourceId: number, targetId: number): Promise<number> => {
      return mergeExercisePairs([[sourceId, targetId]]);
    }),

    /**
     * Applies several `[sourceId, targetId]` merges in one transaction after one safety snapshot.
     * Returns how many logged exercise entries moved.
     */
    mergeExercises: serially(async (pairs: readonly (readonly [number, number])[]): Promise<number> => {
      return mergeExercisePairs(pairs);
    }),
    // End of Exercises (T-022)

    // Warm-ups (T-044)
    /** Untouched generated warm-up ids for one entry; completion always stores the shown values. */
    suggestedWarmupSetIds: serially(async (entryId: number): Promise<number[]> =>
      workoutLogger((await liveStore()).database).suggestedWarmupSetIds(entryId),
    ),
    /** Adds an explicitly requested heuristic warm-up plan. */
    addSuggestedWarmups: serially(async (entryId: number): Promise<void> => {
      workoutLogger((await liveStore()).database).addSuggestedWarmups(entryId);
      notifyListeners();
    }),
    /** Removes only untouched suggested warm-ups. */
    removeSuggestedWarmups: serially(async (entryId: number): Promise<void> => {
      workoutLogger((await liveStore()).database).removeSuggestedWarmups(entryId);
      notifyListeners();
    }),
    /** Saves nullable loading overrides on any exercise, including built-in exercises. */
    updateExerciseLoading: serially(async (exerciseId: number, settings: ExerciseLoadingSettings): Promise<void> => {
      ExerciseEditor.setLoadingSettings((await liveStore()).database, exerciseId, settings);
      notifyListeners();
    }),
    // End of Warm-ups (T-044)

    // Edit past workouts (T-050)

    /** A finished workout with previous performance for shared logging cards; live or missing ids return undefined. */
    pastWorkout: serially(async (workoutId: number): Promise<LiveWorkoutSnapshot | undefined> => {
      const snapshot = liveWorkoutSnapshot((await liveStore()).database, workoutId);
      return snapshot?.workout.isInProgress === false ? snapshot : undefined;
    }),

    /** Takes one safety snapshot before entering History edit mode; no workout data is changed or notified. */
    beginPastWorkoutEdit: serially(async (workoutId: number): Promise<void> => {
      const store = await liveStore();
      workoutLogger(store.database).requireFinished(workoutId);
      await takeHistorySnapshot(store);
    }),

    /** Snapshots first, then deletes a finished workout and tombstones its import identity atomically. */
    deletePastWorkout: serially(async (workoutId: number): Promise<void> => {
      const store = await liveStore();
      workoutLogger(store.database).requireFinished(workoutId);
      await takeHistorySnapshot(store);
      workoutLogger(store.database).deleteFinished(workoutId);
      notifyListeners();
    }),

    /** Saves one finished workout field; duration is in seconds and null keeps an unknown end time. */
    updatePastWorkout: serially(async (workoutId: number, change: FinishedWorkoutChange): Promise<void> => {
      workoutLogger((await liveStore()).database).updateFinished(workoutId, change);
      notifyListeners();
    }),

    /** Saves notes on one workout exercise entry, never the exercise library definition. */
    updateWorkoutExerciseNotes: serially(async (entryId: number, notes: string): Promise<void> => {
      workoutLogger((await liveStore()).database).updateExerciseNotes(entryId, notes);
      notifyListeners();
    }),

    /** Saves notes on one set without replacing its performance or import fields. */
    updateWorkoutSetNotes: serially(async (setId: number, notes: string): Promise<void> => {
      workoutLogger((await liveStore()).database).updateSetNotes(setId, notes);
      notifyListeners();
    }),
    // End of Edit past workouts (T-050)

    /** Manufacturers used in finished sessions, newest first. */
    usedMachineBrands: serially(async (): Promise<string[]> => usedMachineBrands((await liveStore()).database)),

    /** Saves or clears one workout entry's manufacturer. */
    setMachineBrand: serially(async (entryId: number, brand: string | null): Promise<void> => {
      workoutLogger((await liveStore()).database).setMachineBrand(entryId, brand);
      notifyListeners();
    }),

    // Deload (T-062)
    /** Saves/clears an exercise's deload stage; suggestions are calculated separately and sets remain intact. */
    setDeloadStage: serially(
      async (
        entryId: number,
        stage: DeloadStage | null,
        settings?: DeloadSettings,
        targetSets?: number,
      ): Promise<void> => {
        workoutLogger((await liveStore()).database).setDeloadStage(entryId, stage, settings, targetSets);
        notifyListeners();
      },
    ),
    /** Starts stage 1 on all current exercise entries in one transaction. */
    deloadWorkout: serially(async (workoutId: number, settings?: DeloadSettings): Promise<void> => {
      workoutLogger((await liveStore()).database).deloadWorkout(workoutId, settings);
      notifyListeners();
    }),
    // End of Deload (T-062)

    // Workout (T-024)
    // Every write is one logger action and notifies listeners, so the logging screen refreshes after each tap.

    /** The workout being logged with last session's sets for each exercise, or `null` when none is in progress. */
    liveWorkout: serially(async (): Promise<LiveWorkoutSnapshot | null> => {
      const db = (await liveStore()).database;
      const workoutId = workoutLogger(db).activeWorkoutId();
      return workoutId === undefined ? null : (liveWorkoutSnapshot(db, workoutId) ?? null);
    }),

    /** The id of the workout being logged, or `null` when none is in progress. */
    activeWorkoutId: serially(async (): Promise<number | null> => {
      return workoutLogger((await liveStore()).database).activeWorkoutId() ?? null;
    }),

    /** The totals of one finished workout, or `null` when it doesn't exist (for example, nothing was logged). */
    finishedWorkoutSummary: serially(async (workoutId: number): Promise<WorkoutSummary | null> => {
      return workoutSummary((await liveStore()).database, workoutId) ?? null;
    }),

    /**
     * The "Is this right?" check for a set about to be completed, judged against the exercise's recent
     * finished sessions. `null` when the set looks normal.
     */
    liveSetFinding: serially(
      async (
        exerciseId: number,
        weightKilograms: number,
        reps: number,
        kind: SetKind,
        workoutId: number,
      ): Promise<SetFinding | null> => {
        const db = (await liveStore()).database;
        return checkLiveSet(db, exerciseId, weightKilograms, reps, kind, workoutId, new Date()) ?? null;
      },
    ),

    /**
     * Starts a workout and appends `exerciseIds` in order, each pre-filled from its last session.
     * Returns the new workout's id.
     */
    startWorkout: serially(async (name: string, exerciseIds: readonly number[]): Promise<number> => {
      const database = (await liveStore()).database;
      const workoutId = database.transaction(() => {
        const logger = workoutLogger(database);
        const id = logger.start(name, new Date());
        for (const exerciseId of exerciseIds) logger.addExercise(exerciseId, id);
        return id;
      });
      notifyListeners();
      return workoutId;
    }),

    // Past workouts and finishing (T-067)
    /** Drops planned sets and ends the workout at the supplied ISO time or now; an empty workout is deleted. */
    finishWorkout: serially(async (workoutId: number, endedAt?: string): Promise<FinishResult> => {
      const db = (await liveStore()).database;
      const result = db.transaction(() => {
        const finished = workoutLogger(db).finish(workoutId, endedAt === undefined ? new Date() : new Date(endedAt));
        // Dropbox backup (T-042): commit the retry flag with the workout, before the app can close.
        if (
          finished.workoutId !== null &&
          db.value<string>(
            `
          SELECT value FROM appSetting WHERE key = ?
        `,
            [DropboxBackupSetting.provider],
          ) === 'dropbox'
        ) {
          db.run(
            `
            INSERT INTO appSetting (key, value) VALUES (?, 'true')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `,
            [DropboxBackupSetting.pending],
          );
        }
        return finished;
      });
      notifyListeners();
      return result;
    }),

    /** Deletes the workout in progress with everything logged in it. */
    discardWorkout: serially(async (workoutId: number): Promise<void> => {
      workoutLogger((await liveStore()).database).discard(workoutId);
      notifyListeners();
    }),

    /** Renames a workout and replaces its notes (`null` clears them). */
    updateWorkout: serially(async (workoutId: number, name: string, notes: string | null): Promise<void> => {
      workoutLogger((await liveStore()).database).update(workoutId, name, notes);
      notifyListeners();
    }),

    /** Appends exercises to a workout in the order given, each pre-filled from its last session. */
    addExercises: serially(async (workoutId: number, exerciseIds: readonly number[]): Promise<void> => {
      const database = (await liveStore()).database;
      database.transaction(() => {
        const logger = workoutLogger(database);
        for (const exerciseId of exerciseIds) logger.addExercise(exerciseId, workoutId);
      });
      notifyListeners();
    }),

    /** Removes an exercise entry and its sets from the workout. */
    removeExercise: serially(async (entryId: number): Promise<void> => {
      workoutLogger((await liveStore()).database).removeExercise(entryId);
      notifyListeners();
    }),

    /** Moves an exercise entry to a zero-based position in the workout. */
    moveExercise: serially(async (entryId: number, newPosition: number): Promise<void> => {
      workoutLogger((await liveStore()).database).moveExercise(entryId, newPosition);
      notifyListeners();
    }),

    /** Appends a planned set that copies the exercise's last set. */
    addSet: serially(async (entryId: number, kind: 'working' | 'warmup' = 'working'): Promise<void> => {
      workoutLogger((await liveStore()).database).addSet(entryId, kind);
      notifyListeners();
    }),

    /** Replaces a set's load (kilograms, with the unit it was typed in), reps, RPE, kind and duration. */
    updateSet: serially(
      async (
        setId: number,
        weightKilograms: number,
        entryUnit: WeightUnit,
        reps: number,
        rpe: number | null,
        kind: SetKind,
        durationSeconds: number | null,
      ): Promise<void> => {
        workoutLogger((await liveStore()).database).updateSet(
          setId,
          weightKilograms,
          entryUnit,
          reps,
          rpe,
          kind,
          durationSeconds,
        );
        notifyListeners();
      },
    ),

    /** Switches an exercise between kg and lb for its planned sets; stored kilograms don't change. */
    setEntryUnit: serially(async (unit: WeightUnit, entryId: number): Promise<void> => {
      workoutLogger((await liveStore()).database).setEntryUnit(unit, entryId);
      notifyListeners();
    }),

    /** Marks a set done (recording the rest since the previous one) or not done. */
    setCompleted: serially(async (setId: number, completed: boolean): Promise<void> => {
      workoutLogger((await liveStore()).database).setCompleted(setId, completed, new Date());
      notifyListeners();
    }),

    /** Deletes a set. */
    deleteSet: serially(async (setId: number): Promise<void> => {
      workoutLogger((await liveStore()).database).deleteSet(setId);
      notifyListeners();
    }),
    // End of Workout (T-024)

    // Rest timer (T-027)

    /** Remembers the owner's rest target for an exercise, in seconds (kept within the rest timer's limits). */
    setRestTarget: serially(async (exerciseId: number, seconds: number): Promise<void> => {
      setRestTarget((await liveStore()).database, exerciseId, seconds);
      notifyListeners();
    }),
    // End of Rest timer (T-027)

    // Analytics overview (T-064)
    /** First finished workout timestamp, or null when there is no history. */
    firstFinishedWorkout: serially(async (): Promise<string | null> => {
      return (
        (await liveStore()).database.value<string>(`SELECT MIN(startedAt) FROM workout WHERE isInProgress = 0`) ?? null
      );
    }),

    /** Weekly totals and lift trends over a local calendar range, end exclusive. */
    analyticsOverview: serially(async (from: string, to: string, previousFrom: string | null) => {
      const db = (await liveStore()).database;
      const start = new Date(from);
      const end = new Date(to);
      return {
        current: TrainingSummary(db, start, end),
        previous: previousFrom === null ? null : TrainingSummary(db, new Date(previousFrom), start),
        lifts: LiftTrends(db, start, end),
      };
    }),
    // End of analytics overview (T-064)

    // Muscle coverage and intensity (T-065)
    /** Working-set distributions and weekly intensity over inclusive local calendar dates. */
    intensityMix: serially(async (from: string, to: string, muscle?: Muscle) =>
      intensityMix((await liveStore()).database, new Date(from), new Date(to), muscle),
    ),
    // End of Muscle coverage and intensity (T-065)

    // Analytics tab (T-078)
    /** Ordered exercise pins. */
    pinnedExercises: serially(async () => PinnedExercises.list((await liveStore()).database)),
    /** Pin an exercise. */
    pinExercise: serially(async (exerciseId: number) => {
      PinnedExercises.pin((await liveStore()).database, exerciseId);
      notifyListeners();
    }),
    /** Remove an exercise pin. */
    unpinExercise: serially(async (exerciseId: number) => {
      PinnedExercises.unpin((await liveStore()).database, exerciseId);
      notifyListeners();
    }),
    /** Move an exercise pin one place. */
    movePinnedExercise: serially(async (exerciseId: number, direction: 'up' | 'down') => {
      PinnedExercises.move((await liveStore()).database, exerciseId, direction);
      notifyListeners();
    }),
    /** Weekly hard sets and logged effort over inclusive dates. */
    weeklyEffort: serially(async (from: string, to: string, muscle?: Muscle) =>
      WeeklyEffort((await liveStore()).database, new Date(from), new Date(to), muscle),
    ),
    /** Ranked lifts and their median percentage change over an end-exclusive period. */
    strengthRanking: serially(async (from: string, to: string) => {
      const lifts = LiftTrends((await liveStore()).database, new Date(from), new Date(to));
      return { lifts, medianChangePercent: medianLiftChange(lifts) };
    }),
    /** Muscle dashboard over inclusive dates. */
    muscleDashboard: serially(async (from: string, to: string) =>
      MuscleDashboard((await liveStore()).database, new Date(from), new Date(to)),
    ),
    /** Detailed muscle analytics over inclusive dates. */
    muscleDetail: serially(async (from: string, to: string, muscle: Muscle) =>
      MuscleDetail((await liveStore()).database, new Date(from), new Date(to), muscle),
    ),
    // End of Analytics tab (T-078)

    // Template analytics (T-079)
    /** Analytics for a saved workout or plan. */
    templateAnalytics: serially(async (scope: TemplateSessionScope) =>
      TemplateAnalytics((await liveStore()).database, scope),
    ),
    // End of Template analytics (T-079)

    // Strength (T-034)

    // Exercise progress (T-077)
    /** Per-session progress, optionally restricted to a saved workout and recorded machine. */
    exerciseProgress: serially(async (exerciseId: number, templateId?: number, machine?: string | null) => {
      return ExerciseProgress((await liveStore()).database, exerciseId, new Date(), templateId, machine);
    }),

    /** RTS guide and personal load grid, in exact kg rounded to the exercise's entry-unit ladder. */
    exerciseRpeChart: serially(async (exerciseId: number) => {
      const db = (await liveStore()).database;
      const history = ExerciseSeries.read(db, exerciseId);
      const exercise = history.exercise;
      const estimate = ExerciseStrength.series(db, exerciseId, new Date()).latest;
      return {
        guide: rtsRpeChart(),
        curve: exercise?.strengthCurve ?? null,
        estimate,
        lift:
          exercise === null
            ? []
            : liftRpeChart(exercise.strengthCurve, estimate, loadProfileFor(exercise, exercise.defaultEntryUnit)),
      };
    }),

    /** Daily best estimates and smoothed strength in kg; no qualifying history returns empty series. */
    exerciseStrength: serially(async (exerciseId: number): Promise<ExerciseStrengthSeries> => {
      return ExerciseStrength.series((await liveStore()).database, exerciseId, new Date());
    }),
    // End of Strength (T-034)

    // Exercise page (T-057)

    // Workout page (T-066): optional template scope is applied before pagination and machine filtering.

    /** A bounded newest-first page of finished sessions, including completed warm-ups. */
    exerciseHistory: serially(async (exerciseId: number, offset: number = 0, templateId?: number) => {
      return ExerciseSeries.history((await liveStore()).database, exerciseId, offset, new Date(), templateId);
    }),

    /** All applicable per-session chart series, in kg, kg × reps, reps or seconds; formulas live in core. */
    exerciseCharts: serially(async (exerciseId: number, machine?: string | null, templateId?: number) => {
      const allHistory = ExerciseSeries.read((await liveStore()).database, exerciseId, new Date(), templateId);
      const history = machine === undefined ? allHistory : ExerciseSeries.filterMachine(allHistory, machine);
      return {
        machineBrands: ExerciseSeries.machineBrands(allHistory),
        deloadDates: history.sessions
          .filter((session) => session.deloadEntryIds.length > 0)
          .map((session) => session.date),
        estimatedOneRepMax: ExerciseSeries.estimatedOneRepMax(history),
        heaviestWeight: ExerciseSeries.heaviestWeight(history),
        sessionVolume: ExerciseSeries.sessionVolume(history),
        bestReps: ExerciseSeries.bestReps(history),
        progression: ExerciseSeries.progression(history),
        duration: ExerciseSeries.duration(history),
      };
    }),

    // End of Workout page (T-066)

    /** Dated lifetime records and rep-max performances/predictions, kept in exact kg until display. */
    exerciseRecords: serially(async (exerciseId: number) => {
      return RepMaxTable((await liveStore()).database, exerciseId);
    }),
    // End of Exercise page (T-057)

    // Plan summary and active plan (T-069)

    /** Planned muscle counts for a plan or a single workout. */
    templateMuscleSummary: serially(async (scope: { readonly folderId: number } | { readonly templateId: number }) => {
      return templateMuscleSummary((await liveStore()).database, scope);
    }),

    /** Set the active plan, or clear the selection. */
    setActivePlan: serially(async (folderId: number | null): Promise<void> => {
      const db = (await liveStore()).database;
      if (folderId === null) db.run('DELETE FROM appSetting WHERE key = ?', [AppSettingKey.activePlanId]);
      else {
        if (db.value<number>('SELECT id FROM templateFolder WHERE id = ?', [folderId]) === undefined)
          throw new Error('Plan not found.');
        setSetting(db, AppSettingKey.activePlanId, String(folderId));
      }
      notifyListeners();
    }),

    /** The active plan id, or null when none is selected. */
    activePlanId: serially(async (): Promise<number | null> => {
      const value = getSetting((await liveStore()).database, AppSettingKey.activePlanId);
      return value === undefined ? null : Number(value);
    }),

    // Templates (T-029)

    /** Every folder with its templates, and the templates in no folder, in their stored order. */
    templateList: serially(async (): Promise<TemplateList> => {
      return TemplateCatalog.list((await liveStore()).database);
    }),

    /** A template as the editor works on it, or `null` when it doesn't exist. */
    templateDetail: serially(async (templateId: number): Promise<TemplateDraft | null> => {
      return TemplateCatalog.detail((await liveStore()).database, templateId) ?? null;
    }),

    /** Creates a template (no `id`) or replaces one. Returns its id. Throws a `TemplateStoreError` the screen shows as written. */
    saveTemplate: serially(async (draft: TemplateDraft): Promise<number> => {
      const id = TemplateStore.save((await liveStore()).database, draft, new Date());
      notifyListeners();
      return id;
    }),

    /** Updates targets for a matching exercise occurrence in a saved workout. */
    setTemplateRepRange: serially(
      async (
        templateId: number,
        exerciseId: number,
        occurrence: number,
        range: Pick<TemplateSetDraft, 'targetRepsLow' | 'targetRepsHigh' | 'targetRpe' | 'targetRpeHigh'> & {
          readonly restRange?: { readonly low: number | null; readonly high: number | null };
        },
      ): Promise<void> => {
        TemplateStore.setRepRange((await liveStore()).database, templateId, exerciseId, occurrence, range, new Date());
        notifyListeners();
      },
    ),

    /** Renames a template. */
    renameTemplate: serially(async (templateId: number, name: string): Promise<void> => {
      TemplateStore.rename((await liveStore()).database, templateId, name, new Date());
      notifyListeners();
    }),

    /** Deletes a template. Workouts already done from it keep their history. */
    deleteTemplate: serially(async (templateId: number): Promise<void> => {
      TemplateStore.delete((await liveStore()).database, templateId);
      notifyListeners();
    }),

    /** Copies a template next to the original, named "… copy". Returns the copy's id. */
    duplicateTemplate: serially(async (templateId: number): Promise<number> => {
      const id = TemplateStore.duplicate((await liveStore()).database, templateId, new Date());
      notifyListeners();
      return id;
    }),

    /** Moves a template to the end of a folder, or out of every folder (`null`). */
    moveTemplate: serially(async (templateId: number, folderId: number | null): Promise<void> => {
      TemplateStore.move((await liveStore()).database, templateId, folderId);
      notifyListeners();
    }),

    /** Moves a template to a zero-based position within its folder. */
    reorderTemplate: serially(async (templateId: number, position: number): Promise<void> => {
      TemplateStore.reorder((await liveStore()).database, templateId, position);
      notifyListeners();
    }),

    /** Adds a folder after the others and returns its id. */
    createTemplateFolder: serially(async (name: string): Promise<number> => {
      const id = TemplateStore.createFolder((await liveStore()).database, name);
      notifyListeners();
      return id;
    }),

    /** Renames a folder. */
    renameTemplateFolder: serially(async (folderId: number, name: string): Promise<void> => {
      TemplateStore.renameFolder((await liveStore()).database, folderId, name);
      notifyListeners();
    }),

    /** Moves a folder to a zero-based position among the folders. */
    reorderTemplateFolder: serially(async (folderId: number, position: number): Promise<void> => {
      TemplateStore.reorderFolder((await liveStore()).database, folderId, position);
      notifyListeners();
    }),

    /** Deletes a folder; its templates are kept, moved to the end of the unfiled list. */
    deleteTemplateFolder: serially(async (folderId: number): Promise<void> => {
      TemplateStore.deleteFolder((await liveStore()).database, folderId);
      notifyListeners();
    }),

    /** Saves a finished workout's exercises and set kinds as a template with no targets. Returns the template's id. */
    createTemplateFromWorkout: serially(
      async (workoutId: number, name: string, folderId: number | null): Promise<number> => {
        const id = TemplateStore.createFromWorkout((await liveStore()).database, workoutId, name, folderId, new Date());
        notifyListeners();
        return id;
      },
    ),

    /** Updates the linked template from a finished workout, retaining matching targets. */
    updateTemplateFromWorkout: serially(async (workoutId: number): Promise<void> => {
      TemplateStore.updateFromWorkout((await liveStore()).database, workoutId, new Date());
      notifyListeners();
    }),

    /**
     * Starts a workout from a template and returns its id. When one is already in progress this
     * throws, and first refreshes every screen: the one that offered to start is out of date, and
     * refreshing swaps it for the workout in progress, which is the way to resume it.
     */
    startFromTemplate: serially(async (templateId: number): Promise<number> => {
      const logger = workoutLogger((await liveStore()).database);
      if (logger.activeWorkoutId() !== undefined) notifyListeners();
      const workoutId = logger.startFromTemplate(templateId, new Date());
      notifyListeners();
      return workoutId;
    }),
    // End of Templates (T-029)
  };
}

/** The API as the screen sees it. */
export type WorkerApi = ReturnType<typeof createWorkerApi>;
