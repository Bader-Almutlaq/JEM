# T-090: Automatic progression suggestions: weight first or reps first, per exercise

- **Milestone:** Logging polish · **Depends on:** T-089 (merged) · **Model tier:** high (Codex Sol)

## Goal

The owner (2026-11-02): today progression must be switched on per exercise in the editor, with ranges re-entered. "I don't think it is the best feature here. It could apply dynamically or automatically during the workout based on historical data, maybe the last three workouts, and give some sort of suggestion on how to improve, either by increasing repetitions or by increasing weight, depending on the exercise. Sometimes it is easier to increase weight (deadlifts), sometimes repetitions (Romanian deadlifts). Those specifications could be set during the edit."

Measure, don't prescribe: suggestions are small numbers beside the boxes that the owner taps to accept (as today); nothing is applied automatically.

## Read first

- `AGENTS.md`, `docs/DECISIONS.md` (2026-10-31 progression, 2026-11-01 set groups and explicit progression, T-089's target ranges), `reports/Workout tracker app research.md` (double progression, load calculator items 5–7).
- `src/core/logging/ProgressionPlan.ts` (+ tests), `src/core/queries/LiveWorkout.ts`, `PreviousPerformance.ts`, `templateExercise.progression`, the editor's Progression… dialog (after T-089), `progressionValueSuggestion.ts`, live suggestion numbers.

## Specification

1. **Modes per exercise in a saved workout:** **Reps first** (today's double progression: climb reps to the top of the range, then add one load step and return to the bottom), **Weight first** (keep reps in range; when every working set of the last session reached at least the low end of the range at or below the RPE target's high end, add one load step; otherwise repeat the load), and **Off**.
   - Storage: migration `v17` or the next free number (append only): `templateExercise.progressionMode TEXT CHECK (progressionMode IN ('reps-first','weight-first','off'))`. NULL means **automatic default**. Existing `progression = 'double'` rows read as reps-first.
   - **Default when NULL** (`Heuristic:` name the rule and cite the report's double-progression and load-calculator sections): weight first for barbell and trap-bar compounds whose load step is ≤ 2.5% of the current working weight (fine jumps make load progression practical, report item 5's 4% rule); reps first for everything else (dumbbells, machines with coarse steps, isolation). Exercises with no rep range in the workout get suggestions only for the mode's load rule when there is a range on the exercise, else none.
2. **Automatic:** suggestions appear in every session started from a saved workout, without any per-exercise switch, unless the mode is Off. Timed and bodyweight-only exercises: reps first only (no load), as today.
3. **History window:** decide from the **last session** of that exercise in this workout (as today), but hold a load increase when the last **three** sessions show the top working set's RPE rising to or above the target's high end two sessions in a row (`Heuristic:`, the owner's "last three workouts"); then suggest repeating the load. Deload sessions are skipped when looking back.
4. **Editor:** the Progression… sheet from T-089 shows the three modes plus "Automatic (weight first)" / "Automatic (reps first)" naming what the default resolves to; no range re-entry (ranges come from Targets…).
5. **Live:** keep the red suggestion numbers; the info line shows a tiny muted mode tag ("+kg first" / "+reps first") only in the exercise ⋯ sheet, not on the row.
6. Tests (hand-computed): each mode on a synthetic history; default resolution for barbell squat (2.5 kg step at 140 kg → weight first), dumbbell curl (2 kg step at 16 kg → reps first), machine; RPE-rising hold; deload skipped; existing 'double' rows → reps first; Off shows nothing.

## Acceptance criteria

- [ ] `make format`; `make verify` passes.
- [ ] Docs: DECISIONS (modes, default rule, hold rule), DATA (migration), DESIGN (sheet). Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

_Fill in at the end of the session._
