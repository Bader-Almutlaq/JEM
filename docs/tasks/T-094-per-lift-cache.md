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

Implemented; changes left uncommitted. The task board is unchanged.

**Files / public API**

- `src/core/db/Database.ts`: connection-owned tracking, exercise revisions, full-invalidation epoch;
  adds `exerciseVersion(exerciseId): number`. Global `dataVersion` retains its existing semantics.
- `src/core/db/ExerciseChanges.ts` (new): TEMP tracker and `ExerciseChangeLimits.exercises = 256`.
  `ExerciseChanges.prepare()` repairs tracking after schema changes;
  `take(): readonly number[] | null` drains ids or requests full invalidation.
- `src/core/db/QueryCache.ts`: adds `getForExercise(exerciseId, name, parts, compute)`;
  the constructor accepts an optional exercise-version reader after its existing capacity argument.
  Both entry kinds share the existing 600-entry LRU; `clear()` clears both.
- `src/core/queries/ExerciseSessions.ts`, `ExerciseCurve.ts`, `ExerciseSeries.ts`,
  `ExerciseStrength.ts`, `HistoryBoundary.ts`, `LiftTrends.ts`: audited per-exercise reuse.
  `historyBoundaryKey` accepts an optional exercise id; omission preserves its global behavior.
  Session pages now return read-only cached arrays. Worker API signatures are unchanged.
- `src/core/db/ExerciseChanges.test.ts` (new), `QueryCache.test.ts`: regression/equivalence coverage.
- `tools/bench-analytics.ts`: all-write cold, one-exercise-write cold and warm columns.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and this Handoff.

**Dependency audit**

| Per-exercise entry | Dependencies and key inputs |
|---|---|
| `ExerciseSessions.all/page` | Only this lift's entries, completed sets and finished workouts, including workout name/date, machine brand and deload marks. Stored `workout.templateId` is compared directly: no template row is read. Keys retain history boundary, template id, and page limit/offset. |
| `ExerciseCurve` | Canonical sessions and supplied equipment, movement pattern, mechanic and tracking inputs, all retained in the key. The pure fit reads no settings or other lift. |
| `ExerciseSeries.read` | This lift's own exercise row, curve and canonical sessions; history boundary and optional stored template id are keyed. |
| `ExerciseStrength.series` | Only canonical series and pure estimate/trend functions. History boundary, current local date and current time-zone identity are keyed because daily maxima group historical timestamps into civil dates. |
| Exercise-specific `historyBoundaryKey` | Latest finished workout containing this lift. Its cached maximum follows this lift's revision; requests before that maximum retain the exact timestamp. An unrelated future workout cannot change this key. |
| Unscoped `LiftTrends.lift` | Only this lift's canonical series and the exact `from`/`to` instants. The surrounding eligibility/membership query and ranking are still global. Plan-filtered calculations are deliberately uncached here because they read current template membership. |

`AnalyticsHistory` sets/maps, `MuscleDashboard.lifts`, whole-screen worker results, exercise catalog
results and `TemplateSessions` remain global. No cache keyed only by exercise id reads settings,
aliases, template rows, another exercise or shared muscle metadata.

**Interpretations / safety**

- Drain after each statement, including inside transactions, rather than waiting for commit:
  a query inside a transaction must immediately see the preceding write. Commit therefore already
  has updated revisions and drained tracking. Rollbacks that undo writes invalidate every lift,
  including nested savepoint rollbacks, because intermediate reads may have been cached.
- Set moves and entry reassignments track OLD and NEW owners; workout deletes collect membership
  before cascades remove it. REPLACE deletes are included via recursive triggers. Explicit
  deduplication avoids conflicts between tracking inserts under the caller's conflict policy.
- New workouts, unsupported tables, missing tracking, schema changes, no tracked rows, failed writes,
  scripts and more than 256 ids in one statement invalidate all. The overflow row caps TEMP storage
  at 257 ids. A restore starts with a new empty connection cache. No migration changed.
- Exercise inserts track the inserted id, protecting previously cached missing-exercise results.
  A real import inserts workouts or writes unsupported tables and therefore takes the full fallback.
  Merges also fall back because they touch aliases, templates and pins. As required, any settings
  write (including backup metadata during Finish) still invalidates all; such a write cannot receive
  the one-exercise benchmark benefit.

**Verification**

- `make format`; `make verify`: passed. **1,563 tests in 241 files**, 42 more tests than the starting
  1,521. Production build passes with the existing chunk-size/dynamic-import warnings.
- 27 table-driven cases check exact changed revisions, unchanged-result identity, and equivalence
  to a separate freshly opened in-memory SQLite copy. Cases cover insert/update/delete, row moves,
  REPLACE, workout dates/notes/finish/reopen/template membership/delete, exercise metadata and muscles.
- Additional cases cover real finish, merge, import matching existing names, restore plus reinstalled
  TEMP triggers, migration and removed triggers, rolled-back DDL, nested/outer rollback, failure,
  overflow, clock/day/zone keys, and 60 seeded random mutations. Every step compares sessions, pages,
  scoped/unscoped series, curve, strength and per-lift trends, plus the aggregate strength report,
  with a fresh connection. Existing worker import/restore and data-safety suites also pass.
- `make bench` hits the sandbox's denied tsx IPC socket; used the specified equivalent
  `node --import tsx tools/bench-analytics.ts`. No phone/Safari timing claim; no UI changed.

**Benchmark**

Synthetic 953 workouts / 25,565 sets / 80 exercises, Node/WebAssembly. Before is starting
revision `6c13ee2` with the same extended benchmark copied into a temporary checkout. A full
invalidation is an appSetting write; the one-exercise case primes the exact workload, edits one
set note in a transaction, then times the first read. Warm is the median of five identical reads.
The table below records the latest complete run, in milliseconds.

| All-period call | Before all-write | Before one-exercise write | After all-write | After one-exercise write | After warm |
|---|---:|---:|---:|---:|---:|
| analyticsOverview | 434.7 | 438.7 | 449.9 | 75.9 | 0.0 |
| strengthRanking | 365.1 | 365.6 | 382.2 | 7.8 | 0.0 |
| muscleDashboard | 513.5 | 519.3 | 535.6 | 157.1 | 0.0 |
| intensityMix | 525.3 | 521.3 | 538.5 | 179.8 | 0.0 |
| weeklyEffort | 61.1 | 61.9 | 62.3 | 61.1 | 0.0 |
| muscleDetail (chest) | 660.8 | 672.8 | 673.2 | 397.8 | 0.0 |
| pinned lifts (entries, detail, strength) | 77.3 | 76.4 | 84.1 | 86.4 | 0.3 |
| whole tab (as the screen loads it) | 768.8 | 767.0 | 866.5 | 396.4 | 1.4 |

| Whole tab period | Before one-exercise write | After one-exercise write |
|---|---:|---:|
| 4W | 265.7 | 87.3 |
| 12W | 342.3 | 101.1 |
| 6M | 447.7 | 128.8 |
| 1Y | 533.0 | 199.1 |
| All | 767.0 | 396.4 |

Latest All one-exercise load: **396.4 ms vs 767.0 ms before** (about 48% faster), below the
400 ms target in this run. Another complete run of the final code measured **409.0 ms**
(all-write 816.3 ms, warm 1.6 ms), so the margin is small and the target is not consistently met.

**Remaining / review notes**

- The conservative fallback deliberately retains full rebuilds for unsupported tables and failed or
  rolled-back work. TEMP tracking adds write bookkeeping: synthetic history construction increased
  from 0.9 s at the starting revision to about 3.1–3.3 s, including 25,565 set inserts. Per-write
  phone latency was not measured.
- All-period one-exercise cold timing straddles 400 ms (396.4–409.0 ms in two final-code runs).
  The remaining cold work includes global period rows, effort queries and exercise catalog rebuilds;
  they intentionally remain global. Further margin needs separate profiling of those paths.

**Lead review:** Finish writes backup metadata to `appSetting`, and settings/pins/templates/measurements counted as "unsupported", so every finished workout still rebuilt every lift. Those tables (none read by a per-exercise entry, per the audit) now skip tracking, a new empty `workout` row tracks nothing (its entries are tracked as they're added), and a write that touches only them leaves per-lift entries alone; unknown tables (e.g. `exerciseAlias`) still invalidate all. Imports call the new `Database.invalidateAllExercises()` explicitly. The benchmark's all-write column now uses that call (a settings write no longer invalidates lifts). After a one-set edit: All tab 393 ms, 4W 88 ms, muscle detail All 302 ms, plan analytics 105 ms.
