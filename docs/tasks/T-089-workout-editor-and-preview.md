# T-089: Workout editor: day tag, one Targets dialog with ranges, quieter progression, and a preview

- **Milestone:** Templates polish · **Depends on:** T-074, T-084 · **Model tier:** mid (Codex Terra; two rounds expected)
- **Reference screenshots** (owner's iPhone, 2026-11-02, in `.claude/worktrees/references/`): `jem-plan-workout-cards.jpg` (plan's workout cards: the day sits in a grey box that reads like an input), `jem-workout-editor.png` (JEM's editor: big red Progression button per exercise), `strong-edit-template.png` (Strong's editor: Previous column and filled weight/reps, like a live session).
- **Runs in parallel with T-087** (analytics), **T-088** (owns `src/app/design/*`) and **T-091** (owns `src/app/data/*`, `src/worker/*` plumbing). You own `src/app/features/templates/*`, `src/app/features/workout/*` (only what's listed), template core (`src/core/templates/*`), the rest-timer code, and migrations (`v16`). Add worker methods if you need them, without changing the worker's plumbing.

## Goal

The owner's review:

1. **Day on workout cards:** "When specifying the day, it does not really appear very well. It could look like a tag on the workout, in yellow."
2. **Progression in the editor:** "I don't think progression should show here because I am pressing edit… the Progression button looks very large. It could be made smaller, or added to the three dots."
3. **Targets:** "In the three dots I could only specify the rep range. I could not specify the rest time. And for rest time I can't specify a range, 2 to 3 minutes. Rep range: low and high. RPE: I could only specify a value; I want a range as well."
4. **Preview:** "During edit I cannot see the weight and repetitions I've done previously… sometimes I want to see the workout in the same way as when pressing Start: all the data there, just like Strong… the previous session filled in. Sometimes I just want to preview what I'm going to do without starting the workout."

The progression rules themselves (automatic suggestions, weight-first vs reps-first per exercise) are a separate task, T-090. Here, only move the control.

## Read first

- `AGENTS.md`, `docs/DESIGN.md` (templates, live workout, info line), `docs/DECISIONS.md` (2026-10-31 progression, T-074 rep range), `docs/DATA.md`.
- `src/app/features/templates/`: `PlanCard`, workout cards on the plan page (find the card with "Last done"), `TemplateEditor*`, `TemplateExerciseCard*`, `ProgressionControl.tsx`, `ProgressionRangeDialog.tsx`, `RepRangeDialog.tsx`, `templateProgressionEdits.ts`, `templateSetEdits*`, the workout page (`WorkoutTemplatePage` or similar with Exercises/History/Analytics tabs).
- Core: `src/core/templates/TemplateDraft.ts`, `TemplateStore.ts`, `src/core/queries/LiveWorkout.ts` (`plannedTargets`), `PreviousPerformance.ts`, `src/core/logging/ProgressionPlan.ts`, rest timer (`exercise.restTargetSeconds`, the timer component in `src/app/features/workout/`).
- Live workout pieces you will reuse read-only: `ExerciseCard`, `SetRow`, `ValueCell`, `ExerciseInfoLine`.

## Specification

### 1. Day tag

- On the plan's workout cards, show the weekday as a small **tag in the deload/target yellow** (`--color-deload` text on a faint yellow fill, caption size, pill radius) beside or under the workout name, not in a bordered box. Same tag wherever a workout's day is shown (plan card list, workout page header).

### 2. Progression control out of the way

- Remove the large **Progression** button from each exercise in the editor. Its toggle moves into the exercise ⋯ menu as **Progression…** (opens the existing progression dialog). Show a small muted "Progression on" label in the exercise's info line when it is on, so it stays visible.
- Nothing about progression appears in the editor's header row besides ⋯.

### 3. One "Targets…" dialog (editor ⋯, and live ⋯ for linked sessions)

- Replace "Rep range…" with **Targets…**, a bottom sheet with three range rows, each with low and high steppers or number fields:
  - **Reps:** low–high (as today).
  - **RPE:** low–high in 0.5 steps (high optional; a single value when low = high).
  - **Rest:** low–high in 15 s steps, shown as m:ss ("2:00–3:00"); high optional.
- It applies to every working, drop and failure set of the exercise (reps and RPE), and rest to the exercise, as the rep-range dialog does today. Live: saves to the linked saved workout ("Saves to <workout name>"), as today.
- **Storage (migration `v16-target-ranges`, append only):**
  - `templateSet.targetRpeHigh REAL CHECK (targetRpeHigh IS NULL OR (targetRpeHigh >= 1 AND targetRpeHigh <= 10 AND targetRpeHigh >= targetRpe))`. `targetRpe` stays the low end; NULL high means a single value.
  - Rest range: `exercise.restMaxSeconds INTEGER CHECK (restMaxSeconds IS NULL OR restMaxSeconds >= restTargetSeconds)`; `restTargetSeconds` stays the low end.
  - Backups/restore validation, History edits and `updateFromWorkout` carry the new fields. DATA.md updated.
- **Info line:** "6–10 reps · RPE 8–9 · Rest 2:00–3:00" in the existing yellow style (no " · " separators: render as three separate yellow tags/spans with spacing, matching the text rules in ANALYTICS.md).
- **Rest timer with a range:** counts up from the set's completion; the ring/bar fills to the low end and alerts there (as today), then shows "+0:20" and a second, quieter state until the high end, where it alerts again once. Single value behaves as today.
- **Progression** (`ProgressionPlan`): treat an RPE range's high end as the RPE target where it reads one value today (above-target means above the high end). Tests.

### 4. Preview (Strong-style)

- On the saved workout's page, the **Exercises** tab shows each exercise like the live workout, **read-only**: name, info line, column headings "Set · Previous · kg · Reps", one row per planned set with the Previous text ("140 kg × 3 @ 9") and the values the session would start with in grey (last time's values, exactly what Start would prefill), and the progression/deload suggestion numbers if any. No checkmarks, no number pad, no add-set buttons.
- Reuse the live components in a read-only mode (a prop such as `readOnly` on `ExerciseCard`/`SetRow`) or a thin wrapper; don't duplicate the row layout. The data comes from the same core function Start uses to prefill (e.g. `plannedTargets` + `PreviousPerformance`), exposed by one worker method `previewWorkout(templateId)`. Tests in core that the preview equals what starting the workout would create (sets, kinds, prefilled values), without creating a workout.
- The editor (Edit) keeps its targets layout, but gains the same **Previous** column (read-only text) so the owner sees last time's numbers while editing targets.

### 5. Quality

- 430 × 932 in dark and light, no horizontal scroll; the preview rows fit 4-digit weights.
- Tests: day tag renders with the tag class, no bordered day box; no Progression button in the editor, ⋯ has Progression…; Targets dialog saves reps, RPE range and rest range (core + app); migration v15 → v16 keeps rows, new columns NULL; backup round-trip keeps them; rest timer states for a range (pure timer function); preview equals Start's prefill; editor shows Previous text.

## Acceptance criteria

- [ ] `make format`; `make verify` passes.
- [ ] Docs: DESIGN (day tag, targets dialog, preview), DATA (v16), DECISIONS (target ranges; progression control moved). Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

Sections 1 and 2 are implemented: workout weekdays use a yellow tag on plan cards and workout pages; eligible exercises open the existing progression dialog from their menu and show a muted label when enabled. The progression calculation is unchanged. The work is uncommitted.

Sections 3 and 4 remain entirely open. They require the v16 migration and backup/restore and History propagation, targets dialog and live editing, range-aware timer and progression, and the shared read-only preview plus editor Previous column. DATA and the remaining DESIGN and DECISIONS updates belong with those sections. No device visual check has been performed. Run `make verify` after continuing; do not mark this task done until all acceptance criteria pass.


Round 2 partial: migration v16 adds nullable upper bounds, template save/catalog/duplicate and updateFromWorkout preserve the RPE upper bound, and progression uses that bound. Migration, backup restore, template storage and progression coverage were added. The range fields are not yet exposed by the Targets dialog or timer; the existing live setRepRange path still needs range support, as do History propagation, info line, rest controls and timer alerts. Section 4 remains open. Verify the editor's individual RPE edits do not invalidate an existing upper bound when completing the UI. No visual check performed. Do not mark the task complete.

Round 3: Targets editing, separate target labels and the range timer are implemented in this worktree. Rest is stored per exercise, so editing it affects that exercise wherever used. Editor rest changes are staged until the workout is saved; live changes update the linked template and exercise together. Individual RPE edits retain a compatible upper bound and clear an incompatible one; individual rest edits raise the upper bound when necessary. The timer uses the completion timestamp and attempts a quieter second audio alert; iPhone foreground/background audio behavior and both themes still need device verification. Section 4 (preview and editor Previous column) remains open. `make format` and `make verify` passed (214 test files, 1,391 tests). Do not mark the task complete.
