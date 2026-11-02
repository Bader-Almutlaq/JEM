# T-092: Preview a saved workout the way Start would fill it

- **Milestone:** Templates polish · **Depends on:** T-089 (merged) · **Model tier:** high (Codex Sol)
- **Reference** (in `.claude/worktrees/references/`): `strong-edit-template.png`: Strong shows each exercise with Previous and the values the session will start with.
- **Runs in parallel with T-090** (automatic progression), which owns `src/core/logging/ProgressionPlan.ts`, progression modes and the Progression… sheet. Here you own the preview path: a side-effect-free prefill in core, one worker method, read-only rendering on the workout page. Call progression through its existing public function; if T-090 changes its signature you'll adapt at merge.

## Goal

The owner (2026-11-02): "Sometimes I just want to preview what I'm going to do without starting the workout… all of the data there, just like Strong does… the previous session filled in."

T-089 added a Previous column to the editor. What's missing is a read-only view that looks like the live workout with the values Start would prefill.

## Read first

- `AGENTS.md`, `docs/DESIGN.md` (live workout, templates), T-089's task file and Handoff.
- Start path: `WorkerApi.startWorkoutFromTemplate` (or whatever Start calls), `src/core/logging/WorkoutLogger.ts` (template start, warm-up initialisation, deload initialisation), `src/core/queries/LiveWorkout.ts` (`plannedTargets`, how grey values and suggestions are computed), `PreviousPerformance.ts`, `WarmupPlan` or equivalent, `DeloadPlan.ts`.
- Live UI: `ExerciseCard`, `ExerciseCardHeader`, `ExerciseInfoLine`, `SetRow`, `ValueCell`, `SetColumnHeader`.
- Workout page: the saved workout's page with Exercises / History / Analytics tabs.

## Specification

1. **Core, side-effect free:** extract the part of Start that decides each exercise's sets, kinds, grey prefill values, targets, warm-ups and suggestions into a pure function that reads the database but writes nothing (for example `WorkoutPreview(db, templateId, now)` returning the same shape `LiveWorkout` returns for a just-started session, minus ids). Start must call the same function and then persist its result, so the two can't drift. No behaviour change to Start.
2. **Test:** for a synthetic template with history (warm-ups, a drop set, a repeated exercise, a machine brand, a deload in progress, an exercise with progression on), the preview equals what Start creates (compare sets, kinds, prefilled values, targets and suggestions), and the database is unchanged after the preview (row counts and `updatedAt` untouched).
3. **Worker:** `previewWorkout(templateId)`; replace T-089's `templatePreviousPerformance` if the preview covers it (keep the editor's Previous column working, from the same source).
4. **UI:** the saved workout page's **Exercises** tab shows each exercise like the live workout, read-only: name, info line (targets in yellow), "Set · Previous · kg · Reps" headings, one row per set with the Previous text, the starting values in grey and suggestion numbers if any. No checkmarks, number pad, add-set or menu actions. Reuse the live components with a `readOnly` prop (or a thin wrapper) instead of duplicating layout. Keep the Start button where it is.
5. Works at 430 × 932 in dark and light, with 4-digit weights.

## Acceptance criteria

- [ ] `make format`; `make verify` passes.
- [ ] Tests: core preview equals Start and writes nothing; app renders read-only rows (no check buttons, values present).
- [ ] Docs: DESIGN (preview), ARCHITECTURE (concept row: workout prefill). Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

Implemented the shared preview and Start path. `workoutPreview(db, templateId, now)` reads template targets and the same history/machine/occurrence rules as Start, initializes deload build-back and warm-ups without writes, and attaches live targets and suggestions through `withWorkoutPerformance`. `WorkoutLogger.startFromTemplate` persists this result and maps generated warm-up keys to its in-memory provenance. Progression still calls the existing `progressionPlan` public function; no progression modes or formulas changed.

Files: new `src/core/logging/WorkoutPreview.ts` and its test; changed `WorkoutLogger.ts`, `queries/LiveWorkout.ts` and `PreviousPerformance.ts`; added the marked `previewWorkout(templateId)` worker block and `WorkerApi.preview.test.ts`. New `templates/WorkoutPreview.tsx` and `WorkoutPreviewCard.tsx` replace the Exercises-tab summary in `WorkoutPage.tsx`. The wrapper reuses the live header, info line, column headings, set rows and value cells with read-only rendering; their TSX/CSS modules gained this mode. Exercise-name links still open workout-specific progress. Start stays in its existing footer. Updated `WorkoutPage.test.ts`, added `WorkoutPreview.test.tsx`, and documented preview behavior in DESIGN and workout-prefill ownership in ARCHITECTURE.

Interpretations: the live snapshot shape uses workout key 0 and negative local entry/planned-set keys, rather than stored identities, so existing rows and suggestion matching can be reused. Historical Previous/baseline rows retain their real ids. These local keys never reach logging writes. Suggestions stack beneath grey values in read-only mode to reserve width for four-digit weights. The editor's `templatePreviousPerformance` remains because it accepts unsaved machine/progression choices, which a saved-template preview cannot represent; both paths use the existing canonical history functions.

Verification: `make format`, `make verify` and `git diff --check` pass: 224 test files, 1,439 tests (11 added). Coverage includes preview/Start equality for sets, kinds, values, targets, suggestions and warm-up provenance; repeated exercises, machine fallback, active-workout previews, deload build-back, no-history timed targets, explicit/null warm-up settings, empty/missing templates, and read-only rendering. Database byte equality, total changes, row count and template timestamps confirm preview performs no writes; the worker test also checks snapshots and notifications stay unchanged.

Visual review at 430 × 932 in both themes remains required: the sandbox rejected the local dev-server listener with EPERM and browser access was unavailable. Rendering tests cover a long exercise name and four-digit loads, but do not establish pixel fit. No commits were created and BOARD was not edited. Recheck integration if T-090 changes the progression function signature.
