# T-094: Keep untouched lifts cached after a write

- **Milestone:** Performance · **Depends on:** T-091, T-093 (merged) · **Model tier:** high (Codex Sol)

## Goal

Since T-091, every write (a set logged, a workout finished, a note edited) drops the **whole** query cache, so the next Analytics load rebuilds every lift's history, personal curve and strength trend: about 160–180 ms of fixed cost before anything else (T-093's Handoff: ~211 ms across 80 `ExerciseSessions` reads in one muscle-detail load). Finishing a workout usually touches 5–8 exercises out of 80.

Make per-lift results survive writes that don't touch that lift, so the first Analytics load after a workout only rebuilds the lifts trained in it. Target on `make bench`: after a write that touches one exercise, the whole Analytics tab for **All** under **400 ms cold** (T-093 reached 774 ms), and every result identical to a fresh computation.

## Read first

- `AGENTS.md`, `docs/ARCHITECTURE.md` (query cache, data version), `docs/DECISIONS.md` (T-091, T-093 entries), T-091 and T-093 Handoffs.
- `src/core/db/Database.ts` (`dataVersion`, `writeCount`, `cache`), `src/core/db/QueryCache.ts` (+ tests), `src/core/queries/ExerciseSessions.ts`, `ExerciseCurve.ts`, `ExerciseStrength.ts`, `ExerciseSeries.ts`, `HistoryBoundary.ts`, `LiftTrends.ts`, `AnalyticsHistory.ts`, `src/core/db/migrations.ts` (schema), `src/worker/WorkerApi.ts` (writes, import, restore), `tools/bench-analytics.ts`.

## Specification

1. **Record what a write touched.** On each connection, create **TEMP** triggers (not a migration: they live only for the connection) that insert affected exercise ids into a TEMP table `changedExercise`:
   - `workoutSet` insert/update/delete → the exercise of its `workoutExercise`.
   - `workoutExercise` insert/update/delete → its `exerciseId` (old and new on update).
   - `workout` update/delete (startedAt, endedAt, isInProgress, templateId or anything) → every exercise in that workout.
   - `exercise` update/delete → that id (equipment, mechanic, tracking, load step and merges change estimates); `exerciseMuscle` changes → that exercise.
   - Any other table, an import, a restore, a migration, a bulk SQL path without triggers, or an overflow of the changed set → **everything** is stale (fall back to today's behaviour).
   After each write transaction commits (or rolls back), read and clear `changedExercise`, bump a per-exercise version for each id, and bump the global version as today.
2. **Two kinds of cache entry:**
   - **Per-exercise entries** (`ExerciseSessions.all/page`, `ExerciseCurve`, `ExerciseStrength.series`, `ExerciseSeries.read`, and any other result that depends only on one exercise's rows plus that exercise's own metadata) are keyed by that exercise's version and survive writes to other exercises.
   - **Everything else** (whole-screen results, `AnalyticsHistory`, `MuscleDashboard.lifts`, ranking) stays tied to the global version and is dropped on any write, as today. These now rebuild quickly because they reuse the surviving per-exercise parts.
   - Give `QueryCache` an explicit API for this, e.g. `get(name, parts, compute)` (global) and `getForExercise(exerciseId, name, parts, compute)`. Results that depend on time (`historyBoundaryKey`, "now") keep that in their key.
   - Audit every per-exercise cached function: if it reads anything beyond that exercise's sets/entries/workouts and its own `exercise` row (for example settings, another exercise, template data), either include that in its key or keep it global. Write down the audit in the Handoff.
3. **Safety first.** If anything is uncertain, invalidate more, never less. A stale estimate would be a data-trust bug.
   - Test, for each trigger case above, that the per-exercise version moves for exactly the expected exercises and that cached results then equal fresh ones: logging a set, editing a set, deleting a set, adding/removing/reordering an exercise in a workout, changing a workout's date, finishing and deleting a workout, editing an exercise's equipment, merging two exercises, editing muscles, an import, a restore, a rolled-back write, a migration.
   - A property-style test: random sequences of writes on a synthetic history, after each one compare every per-exercise cached result with an uncached computation.
4. **Benchmark:** extend `make bench` with "after a one-exercise write" cold timings next to "after a write that touches everything". Report before/after in the Handoff.
5. No worker API changes; the app keeps reacting to the global data version as today.

## Acceptance criteria

- [ ] `make format`; `make verify` passes; `make bench` reports the one-exercise-write cold times (All whole tab target < 400 ms; report what you reach).
- [ ] Tests listed above, including the random-sequence equivalence test.
- [ ] Docs: ARCHITECTURE (cache: global vs per-exercise entries, change tracking), DECISIONS. Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

_Fill in at the end of the session._
