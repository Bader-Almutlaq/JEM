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

_Fill in at the end of the session._
