# Architecture

## Folder layout

```
JEM/
├── AGENTS.md                Rules and start-of-session routine for every agent (CLAUDE.md is a symlink to it)
├── .claude-plans/           Multi-step plans in progress, so any agent can resume (see its README)
├── docs/                    PLAN, architecture, data, design, decisions
│   ├── agents/WORKFLOW.md   How agents claim tasks, work in parallel, review and hand off
│   └── tasks/               Task board (BOARD.md) and a brief for each open task
├── Makefile                 The only build/test entry point (`make help`)
├── index.html               The page shell: iOS Home Screen meta tags, root element
├── vite.config.ts           Build, offline support (service worker) and the Home Screen manifest
├── eslint.config.js         Lint rules, including the layer boundaries
├── tsconfig.*.json          core (no DOM), app (DOM + worker), node (tools); `make typecheck` runs all three
├── public/                  Home Screen icons (rendered by `make icon`)
├── design/                  SVG sources for graphics (app icon)
├── tools/                   Developer scripts run on the Mac (icon renderer, import report)
├── src/
│   ├── core/                WorkoutCore: all logic, no UI, synchronous, tested in Node
│   │   ├── db/              Database wrapper, migrations, settings
│   │   ├── models/          Row types, one per table
│   │   ├── units/           kg/lb conversion and original-unit inference
│   │   ├── import/          Strong, FitNotes, Fitbod and Hevy parsing, planning, importing
│   │   ├── export/          Strong-format and measurement CSV export
│   │   ├── measurements/    Body measurements
│   │   ├── validation/      Typo / outlier checks
│   │   ├── queries/         Read-only queries behind screens
│   │   ├── backup/          Validating and restoring backup files
│   │   ├── library/         Exercise library, muscles, search, edits
│   │   │   └── library.json Generated catalog (edit the source mapping)
│   │   ├── logging/         Writing a workout as it happens, rest timer
│   │   ├── templates/       Workout templates and folders
│   │   ├── analytics/       e1RM, trend, volume, intensity…
│   │   └── support/         Logging and other shared plumbing
│   ├── worker/              The Web Worker that owns the live database
│   │   ├── database.worker.ts   Entry point: opens the store, exposes the API
│   │   ├── OnDeviceStore.ts     The database file on the phone, safety snapshots
│   │   └── WorkerApi.ts         Everything the screen may ask of the database
│   └── app/                 React screens
│       ├── main.tsx, App.tsx    Entry point, routes and tab bar
│       ├── data/                The worker client (`database`), `useDatabaseQuery`, offline/updates, storage
│       ├── design/              tokens.css, global.css, shared components
│       ├── appearance/          System / Dark / Light preference
│       └── features/<area>/     One folder per screen area
├── reports/, research_notes/     Research behind every formula
└── export_data/             The owner's real Strong export (git-ignored, never committed)
```

## Layers and dependency direction

```
src/app (React screens)
        │  async calls through `database` (Comlink)
        ▼
src/worker (WorkerApi: one method per screen need)
        │  synchronous calls
        ▼
src/core (WorkoutCore: services → models → Database)
        │
        ▼
SQLite (WebAssembly) on the phone's private file system
```

- **WorkoutCore** knows nothing about React, the DOM or workers. Its TypeScript config has no DOM types, so it can't reach the screen, files or the network. It runs and tests in Node, which keeps feedback fast.
- **The worker** is the only place the live database is opened. Each `WorkerApi` method calls WorkoutCore and returns plain data (results are copied between threads). Write methods notify subscribers with the new data version, so every open screen holding an older result refreshes. Expensive reads use `Database.cache`: whole-screen results follow the global data version, while per-exercise results survive writes to other lifts (see the cache section below and DECISIONS, T-094).
- **Screens** read with `useDatabaseQuery(key, () => database.someRead(...))` and write with `await database.someWrite(...)`. They hold view state only (what's selected, what's being typed).
- ESLint (`eslint.config.js`) fails the build if core imports app/worker/React, or if the app imports SQLite or `core/db`.

## Glossary (allowed abbreviations)

| Term | Meaning |
|---|---|
| RPE | Rating of perceived exertion, 1–10 scale (Zourdos 2016) |
| RIR | Reps in reserve; RIR = 10 − RPE |
| e1RM | Estimated one-rep max, in kg |
| Hard set | A working set at RIR ≤ 4 (or RIR unknown) |
| Fractional sets | Hard sets weighted 1.0 for primary muscles and 0.5 for secondary (Pelland 2025) |
| Block | A user-marked training period (mesocycle) used for comparisons |
| OPFS | The browser's private file system, where the database lives on the phone |

## Concept ownership

Each concept is implemented once, in one place. When adding a concept, add a row here.

| Concept | Owner |
|---|---|
| Personal strength-curve fitting and canonical history boundary | `src/core/analytics/PersonalCurve.ts`, `src/core/queries/ExerciseCurve.ts`; curve metadata accompanies exercises into `estimatedOneRepMax` |
| RTS reference and personal RPE load grids | `src/core/analytics/RpeChart.ts` |
| Scoped per-session exercise progress and four-session changes | `src/core/queries/ExerciseProgress.ts` |
| Training overview weekly totals and period lift trends | `src/core/queries/TrainingSummary.ts`, `src/core/queries/LiftTrends.ts` |
| SQLite access (queries, transactions, export/import bytes) | `src/core/db/Database.ts` |
| Global data version, per-exercise revisions and the bounded per-connection result cache | `src/core/db/Database.ts` (`dataVersion`, `exerciseVersion`, `cache`), `src/core/db/QueryCache.ts` |
| Connection-local affected-exercise tracking and conservative full-invalidation fallback | `src/core/db/ExerciseChanges.ts`; TEMP tables/triggers, never a migration or backup payload |
| Cache key for "finished history through now" | `src/core/queries/HistoryBoundary.ts` (`historyBoundaryKey`); optional exercise id keeps lift boundaries independent |
| Shared completed-set rows for period muscle and intensity queries, exercise metadata and muscle associations | `src/core/queries/AnalyticsHistory.ts`; exact half-open range and optional current plan membership, cached by the connection's data version |
| The one SQL read of an exercise's finished sessions (pages for History, cached full history for curve, charts, records and strength) | `src/core/queries/ExerciseSessions.ts` |
| Deterministic library conversion and reviewed source decisions | `tools/build-library.ts`, `data/sources/library-mapping.json` (frozen original families plus every source id) |
| Library instruction steps and optional pinned picture frames | `LibraryFile.ts` → `LibraryExercise.ts` → `ExerciseLibrarySeeder.ts`; nullable `Exercise.instructions`/`imageKeys` |
| Reviewed exercise illustration mapping | `tools/build-illustrations.ts`, `data/sources/illustration-mapping.json`, `src/core/library/illustrations.json` |
| Exercise picture display preference, safe URLs and frame visibility | `src/app/features/exercises/picturePreference.ts`, `ExercisePictures.tsx`, `ExercisePicture.tsx`; cache policy in `vite.config.ts` |
| Library source credits | `src/app/features/settings/CreditsScreen.tsx` |
| Machine manufacturer list, equipment eligibility and normalization | `src/core/library/MachineBrands.ts` |
| Schema and migrations | `src/core/db/migrations.ts` |
| Opening the database on the phone; safety snapshots | `src/worker/OnDeviceStore.ts` |
| What the screen can ask of the database | `src/worker/WorkerApi.ts` |
| Running a query from a screen and refreshing after writes | `src/app/data/database.ts` (`useDatabaseQuery`); remembered results, staleness and request sharing in `QueryResultStore.ts`; one refresh per burst of writes in `ChangeCoalescer.ts` |
| Offline support and "Update ready" | `src/app/data/appUpdate.ts` |
| Asking the browser to keep storage | `src/app/data/persistentStorage.ts` |
| Logging categories | `src/core/support/log.ts` |
| Which calendar day a timestamp falls on (phone's time zone) | `src/core/support/localDate.ts` (`localDateKey`) |
| Ordered grouping (first-appearance order) | `src/core/support/groupBy.ts` |
| Light / dark preference | `src/app/appearance/appearance.ts` |
| Color, type, spacing, radius and motion tokens | `src/app/design/tokens.css` |
| Weight, volume, RPE, set-label, date and duration text (always `en-US` digits) | `src/app/format/` (`weightText.ts`, `setText.ts`, `dateText.ts`, `formatLocale.ts`) |
| Shared screen pieces (screen, section, rows, back link, empty state, tab bar, buttons, chips, fields, search field, confirm dialog) | `src/app/design/components/` |
| Exercise list sections, browse state, text and drafts on screen | `src/app/features/exercises/` (`exerciseSections.ts`, `exerciseBrowseState.ts`, `exerciseText.ts`, `exerciseDraft.ts`) |
| Logging screen: writes applied in tap order, number-pad draft and steps, set cell text | `src/app/features/workout/` (write queue, number draft, pad steps, set cell text helpers) |
| Clock text (elapsed workout time, rest) | `src/app/format/clockText.ts` |
| Which Strong names to merge into which exercises (matching screen) | `src/app/features/matching/matchingPlan.ts`; merges run through `ExerciseEditor.mergeAll` after a snapshot |
| Key–value app settings | `src/core/db/AppSetting.ts` (`AppSettingKey` lists core keys; cloud keys are in the T-042 worker block) |
| kg ↔ lb conversion, display rounding, original-unit inference | `src/core/units/WeightUnit.ts`, `src/core/units/Weight.ts` |
| Stored record types (one per table), 0/1 → boolean conversion | `src/core/models/` (`from<Type>Row`) |
| Import app choices and export instructions | `src/app/features/import/importSources.ts` |
| CSV reading | `src/core/import/CsvTable.ts` |
| Strong file formats and timestamps | `src/core/import/StrongWorkoutsFile.ts`, `StrongMeasurementsFile.ts`, `StrongRow.ts`, `StrongTimestamp.ts` |
| Which unit an exported exercise is in | `src/core/import/ExportUnitResolver.ts` |
| Import review (plan, decisions) and writing it | `src/core/import/StrongImportPlan.ts`, `StrongImportOptions.ts`, `StrongImporter.ts` (the worker snapshots first) |
| Typo / outlier detection (import review and live logging) | `src/core/validation/SetPlausibility.ts` |
| Live typo check for one set | `src/core/validation/LiveSetCheck.ts` (shares `summariseSessions` with the import review) |
| Personal bests and history record counts | `src/core/queries/PersonalBests.ts` |
| Workout comparison | `src/core/queries/WorkoutComparison.ts` |
| History list and workout detail queries | `src/core/queries/WorkoutHistory.ts` |
| Grouping the history list by month (phone's time zone) | `src/core/queries/WorkoutMonthGroups.ts` |
| Cloud backup orchestration, PKCE, token lifetime, Dropbox HTTP calls and retry status | `src/app/data/dropbox/DropboxBackup.ts`, `pkce.ts`, `DropboxTokenStore.ts`, `DropboxApi.ts`; singleton in `cloudBackup.ts`, key selection in `effectiveDropboxAppKey.ts`, with a built-in default in `src/app/data/dropboxConfig.ts` |
| Cloud backup retention (newest 14 plus earliest local-month server timestamp, exact root backup filenames only) | `src/core/backup/CloudRetention.ts` (`cloudBackupPathsToDelete`) |
| Non-secret cloud backup settings and pending flag committed with Finish | `src/worker/WorkerApi.ts` → Dropbox backup (T-042) blocks; upload completion checks the export write revision before clearing pending |
| When to remind the owner to back up | `src/core/backup/BackupReminder.ts` (`BackupReminderPolicy`) |
| Preparing and sharing the backup file on screen (Settings and finish summary) | `src/app/features/settings/useBackupFile.ts` |
| Reading files the owner picks (read first, then clear the picker; iOS Safari drops picked files once it is cleared) | `src/app/data/readPickedFiles.ts` |
| Backup file naming, age, validation and the restore sequence | `src/core/backup/BackupFile.ts`, `BackupAge.ts`, `BackupValidation.ts`, `BackupRestore.ts`; `OnDeviceStore` implements its storage |
| Whether a phone holds any data worth protecting (empty-phone upload guard, fresh-install restore card) | `src/core/backup/isDatabaseEmpty.ts` |
| Muscle taxonomy (23 muscles, delts split), regions and roles | `src/core/library/Muscle.ts`, `MuscleRegion.ts`, `MuscleRole.ts`; rows frozen in `v1-schema` (a test compares them) |
| Equipment, movement patterns, mechanic, tracking kinds | `src/core/library/Equipment.ts`, `MovementPattern.ts`, `Mechanic.ts`, `ExerciseTracking.ts` |
| The built-in exercise list (names, muscles, aliases) | `src/core/library/library.json`, parsed by `LibraryFile.ts`, loaded and validated by `ExerciseLibrary.ts` |
| Exercise naming ("Movement (Equipment)") and stable keys | `ExerciseLibrary.exerciseName`, `ExerciseLibrary.key` |
| Copying the library into the database on launch | `src/core/library/ExerciseLibrarySeeder.ts` |
| Writing an exercise's muscle rows | `src/core/library/replaceExerciseMuscles.ts` |
| Name or alias → exercise | `src/core/library/ExerciseNameResolver.ts` (`exerciseIdNamed`) |
| Creating, editing, archiving and merging exercises | `src/core/library/ExerciseEditor.ts` (the worker snapshots before a merge) |
| Search text normalisation, slang, typo distance | `src/core/library/SearchText.ts`, `GymSlang.ts` |
| Exercise search and import-name suggestions | `src/core/library/ExerciseSearch.ts` (`SearchTuning` holds every score) |
| Exercise list, detail and unmatched-import queries | `src/core/queries/ExerciseCatalog.ts` |
| Loadable weight ladders, equipment defaults, kg/lb overrides and rounding | `src/core/units/LoadableWeight.ts` |
| Deload stages, reductions and pre-cycle load suggestions | `src/core/logging/DeloadPlan.ts`; persistence/advance in `WorkoutLogger`, history resolution in `PreviousPerformance` |
| Per-template double-progression calculation, per-set rep/RPE gates and loadable steps | `src/core/logging/ProgressionPlan.ts`; live query attaches ephemeral suggestions |
| Shared big barbell compound classification for warm-ups and deload | `src/core/logging/WarmupPlan.ts` (`isBigBarbellCompound`) |
| Warm-up schemes, suggested counts and protected-slot refresh | `src/core/logging/WarmupPlan.ts`; provenance in `WorkoutLogger`, retained per database connection by `WorkerApi` |
| Logging live and editing finished workouts, notes, timing, dense positions and historical completion semantics | `src/core/logging/WorkoutLogger.ts` (`WorkoutLoggerLimits`, `FinishedWorkoutChange`) |
| Deleted imported source keys (appSetting JSON tombstones), shared with importer duplicate detection | `WorkoutLogger.deletedSourceKeys` / `deleteFinished`; `StrongImporter` skips these keys in import and preview counts |
| History edit-entry and delete snapshot boundaries | `WorkerApi.ts` → Edit past workouts (T-050) block; existing `OnDeviceStore.takeSnapshot` |
| History edit view state and metadata presentation | `src/app/features/history/` (`PastWorkoutEditor`, `usePastWorkoutEditor`, `pastWorkoutFields`); existing live cards, pad, queue and typo prompt |
| Rest timer: default and limits, per-exercise target, elapsed and remaining | `src/core/logging/RestTimer.ts` (`RestTimerDefaults`); bar in `src/app/features/workout/RestBar.tsx` |
| Templates and folders: save, edit, reorder, duplicate, delete, save a workout as a template | `src/core/templates/TemplateStore.ts` (`TemplateDraft`, `TemplateStoreError`) |
| Plan/workout session scope, completed work totals, known-duration means and first-exercise per-session e1RM | `src/core/queries/TemplateSessions.ts`; worker Plans and workouts (T-058) block |
| Plan cards, workout pages and workout-specific exercise tabs | `src/app/features/templates/` (`PlanScreen`, `PlanPage`, `WorkoutPage`, `WorkoutExercisePage`) |
| Workout and plan scoped analytics, completed versus planned muscle sets | `src/core/queries/TemplateAnalytics.ts` |
| Planned muscle sets and workout frequency | `src/core/queries/TemplateMuscleSummary.ts` |
| Template list and editor data | `src/core/queries/TemplateCatalog.ts` |
| A workout draft's exercise and set counts and average planned RPE (editor and form header) | `src/core/templates/TemplateStats.ts` |
| Workout prefill: template sets, previous values, deload stage, warm-ups and preview | `src/core/logging/WorkoutPreview.ts` (`workoutPreview`); Start persists its result; `LiveWorkout.withWorkoutPerformance` attaches shared targets and suggestions |
| Starting a workout from a template | `WorkoutLogger.startFromTemplate` |
| Template screens and draft editing on screen | `src/app/features/templates/` (pure draft-edit and target-text helpers there) |
| Bottom sheet | `src/app/design/components/BottomSheet.tsx` |
| Which days had a workout (History calendar) | `src/core/queries/WorkoutCalendar.ts`; grid in `src/app/features/history/calendarGrid.ts` |
| Effective reps (RIR from RPE) | `src/core/analytics/EffectiveReps.ts` |
| Estimated 1RM per set, k by exercise category, which sets qualify | `src/core/analytics/EstimatedOneRepMax.ts` |
| Strength trend (EWMA), change per week | `src/core/analytics/StrengthTrend.ts`; per exercise via `src/core/queries/ExerciseStrength.ts` |
| Per-exercise finished-session pages and chart series, optionally scoped to a workout (e1RM, load, volume, reps, duration, cumulative PR) | `src/core/queries/ExerciseSeries.ts`; reuses `EstimatedOneRepMax` for estimates |
| Dated lifetime exercise records and 1–12-rep best/predicted table | `src/core/queries/RepMaxTable.ts`; predictions invert the canonical unit-load estimate, display rounds through `estimateText` |
| Exercise section URL state, lazy section queries and bounded history display | `src/app/features/exercises/exercisePageTabs.ts`, `ExerciseDetailScreen.tsx` and its tab components |
| Muscle prominence and visibility | `src/core/library/MuscleProminence.ts` |
| Muscle coverage, frequency, balance and exercise share | `src/core/queries/MuscleCoverage.ts` |
| Rep and effort distributions; weekly relative intensity | `src/core/queries/IntensityMix.ts` |
| Hard sets; fractional sets per muscle; volume zones | `src/core/analytics/HardSets.ts`, `MuscleVolume.ts`; weekly via `src/core/queries/WeeklyMuscleVolume.ts` |
| Measurement sites, guides, states, exact cm/in conversion and Body unit settings | `src/core/measurements/MeasurementSite.ts`, `MeasurementStore.ts`, `MeasurementUnits.ts` |
| Measurement site groups and complete per-site history | `src/core/measurements/MeasurementQueries.ts` |
| Measurement change (4/12 weeks, since-first, least-squares monthly rate) | `src/core/measurements/MeasurementChange.ts` |
| Measure list, detail and entry/guide/custom-body-part sheets | `src/app/features/body/` |
| What was done last time for an exercise | `src/core/queries/PreviousPerformance.ts` |
| The workout in progress as the logging screen shows it | `src/core/queries/LiveWorkout.ts` |
| Which workout is in progress, and its name and start time for the tab bar's resume strip | `src/core/queries/ActiveWorkoutSummary.ts` (`WorkoutLogger.activeWorkoutId` reads it) |

Developer tool: `tools/bench-analytics.ts` (`make bench`) times every analytics call cold and warm on a seeded synthetic history (`src/core/queries/fixtures/SyntheticHistory.ts`) at the owner's scale; it never reads `export_data/`.

Developer tool: `tools/import-report.ts` (`make import-report`) dry-runs the importer on `export_data/` and prints totals, unit verdicts and flagged sets. It's the only code allowed to read the owner's real export.

### Long-range chart ownership

| Concept | Owner |
|---|---|
| Training overview weekly totals and period lift trends | `src/core/queries/TrainingSummary.ts`, `src/core/queries/LiftTrends.ts` |
| Local calendar period choice, range windows, sum/mean/max/last aggregation and min/max/count | `src/core/analytics/TimeBuckets.ts` (`TimeBuckets`) |
| Every dated chart: aggregation for the visible span, gaps, deload marks, trend line, press-and-drag callout, landscape pinch-zoom view and table | `src/app/design/charts/TimeChart.tsx` (maths in `timeChartMath.ts`, model in `timeChartModel.ts`, gestures in `useTimeChartGesture.ts`) |
| Following one pointer across the window for a swipe or drag (listeners, finger filtering, holding off touch scrolling) | `src/app/design/gestures/followPointer.ts` |
| Least-squares trend line through dated values | `src/core/analytics/LinearTrend.ts` |
| Measure routes and grouped body-part navigation | `src/app/features/body/MeasureScreen.tsx` (`/measure`, `/measure/:bodyPart`) |
| Main-tab Settings gear and trailing header slot | `src/app/design/components/SettingsButton.tsx`, `Screen.tsx` |


### Analytics dashboard ownership (T-078)

`PercentOfMax` owns the bounded set-load percentage; `PinnedExercises` owns pin persistence and
ordering. `LiftTrends`, `MuscleDashboard`, `WeeklyEffort` and `IntensityMix` supply the Analytics
tab and muscle detail through the worker. Views format and navigate these results.


## Query cache and change tracking

`Database.cache.get(name, parts, compute)` follows `dataVersion` and invalidates after every write.
Whole-screen worker results, ranking, `MuscleDashboard.lifts`, `AnalyticsHistory` rows/maps and
`TemplateSessions` remain global because they read multiple exercises or current template membership.
The worker API and screen notifications still use the global version.

`getForExercise(exerciseId, name, parts, compute)` follows `Database.exerciseVersion(exerciseId)`.
`ExerciseSessions.all/page`, `ExerciseCurve`, `ExerciseSeries.read`, `ExerciseStrength.series`,
the exercise-specific history boundary and unscoped `LiftTrends.lift` calculation use it. These read
only that lift's own exercise metadata, entries, sets and workouts. Template-id filters compare the workout's stored id without reading
saved-template rows. Equipment/pattern/mechanic/tracking inputs remain in curve keys; exact historical
timestamps and the strength trend's local calendar day and time zone remain in clock-dependent keys.
Per-lift period trends keep exact `from`/`to` instants; their eligibility/membership query and aggregate ranking remain global. Plan-filtered
trend calculations also remain global because membership depends on current template rows. Global and
per-exercise entries share the existing 600-entry LRU bound and read-only result contract.

Every connection installs TEMP `changedExercise`/`changedExerciseState` tables and TEMP triggers on
`main` tables. Set and entry changes track both old/new owners, workout updates/deletes track all
its exercises, and exercise/muscle changes track their own ids. BEFORE DELETE preserves links before
cascades; recursive triggers include the implicit deletes performed by REPLACE. Other tables and
new workouts mark everything stale. Main/TEMP schema versions detect migrations or removed triggers;
tracking rebuilds before the next `run`.

After each `run`, including statements inside transactions, tracking is read/cleared and the affected
revisions advance. This also protects reads made before commit. Scripts (`exec`), failed or untracked
writes, more than 256 affected exercises in one statement, and any rollback that undoes writes use a
full-invalidation epoch. Rolled-back temporary results therefore cannot survive; read-only transactions
retain cached data. Restores open a new connection with no results. TEMP tracking stores at most
257 ids (the extra id detects overflow) and is absent from exported SQLite files.
