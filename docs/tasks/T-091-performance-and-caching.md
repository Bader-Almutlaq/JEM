# T-091: Make analytics fast: measure, cache, and stop needless recalculation

- **Milestone:** Performance · **Depends on:** T-085 · **Model tier:** high (Claude subagent, lead model)
- **Runs in parallel with T-087** (analytics UI and strength queries: `src/app/features/analytics/*`, `LiftTrends.ts`, new `StrengthIndex.ts`), **T-088** (`src/app/design/*`) and **T-089** (templates, workout, migrations). You own `src/app/data/*` (`useDatabaseQuery`, the database client), `src/worker/*` plumbing (subscriptions, change notifications), and caching inside core query boundaries (`src/core/queries/ExerciseCurve.ts`, a new cache module). Avoid editing `LiftTrends.ts` and feature screens; if a hot path is there, add memoisation at the boundary it calls (for example the per-exercise curve or per-exercise session history) instead, and note anything else for the lead.

## Goal

The owner (2026-11-02): "it appears that we are recalculating many things and we're not really caching, so the app is not smooth in showing the analytics and numbers… if I press 12 weeks, every time it just recalculates." Their history is about 4 years of Strong data (roughly 900 workouts, 20–25k sets, 80+ exercises).

## Read first

- `AGENTS.md`, `docs/ARCHITECTURE.md` (layers, worker API), `docs/DATA.md`.
- `src/app/data/database.ts` (`useDatabaseQuery`: re-runs on mount, on key change and on **every** database change notification), `src/worker/` (WorkerApi, subscribe/notify), `src/core/queries/ExerciseCurve.ts` + `src/core/analytics/PersonalCurve.ts` (fits k over 85 steps per exercise from the full history), `LiftTrends.ts`, `MuscleDashboard.ts`, `IntensityMix.ts`, `WeeklyEffort.ts`, `ExerciseProgress.ts`, `TemplateAnalytics.ts`, `AnalyticsDashboard.tsx` (query keys use `range.to.toISOString()`; check whether `now` makes keys change on every mount).

## Specification

### 1. Measure first

- Add a benchmark script `tools/bench-analytics.ts` (run with `npx tsx`, documented in the Makefile as `make bench`) that builds a **synthetic** in-memory database at the owner's scale (seeded generator: 4 years, ~900 workouts, ~25k sets, 80 exercises, logged RPE on most sets, a few deloads, 3 plans) and times each worker-facing analytics call the Analytics tab, exercise page and plan/workout tabs make, cold and warm. Never read `export_data/`.
- Record the before numbers in the Handoff.

### 2. Cache in the worker (core boundary)

- A small cache module in core (pure TypeScript, no DOM), owned by the database connection, keyed by query name + arguments, invalidated by a **data version** that increments on every write transaction (and on import/restore/migration). Reads with the same version return the cached value.
- Memoise the expensive per-exercise pieces across queries: the personal curve (`ExerciseCurve`) and each exercise's session history/trend, keyed by exercise id + data version. Most analytics calls re-derive these for every lift.
- Results stay identical to uncached: add tests that run each cached query twice, write a set, and check the result updates.

### 3. Fewer refreshes in the app

- `useDatabaseQuery`: keep the last value per key in an in-memory LRU (about 50 entries) so returning to a screen or switching period chips back shows the previous result **instantly**, then refreshes in the background if the data version changed (stale-while-revalidate; no loading flash when a cached value exists).
- Change notifications carry the new data version; a query refreshes only if its cached version is older. Coalesce bursts of writes (for example during a live workout) into one refresh per animation frame or 100 ms.
- Make period ranges stable: round `to`/`now` to the day (or the start of the current hour) so keys don't change on every mount. Coordinate the exact rounding with the existing `analyticsPeriod` helper (you may edit `analyticsPeriod.ts` only for this).

### 4. Hot spots

- Using the benchmark, fix the top offenders inside your scope (SQL indexes via a new migration only if clearly needed: coordinate the number with T-089, which uses `v16`; use `v17`), N+1 query loops in worker-facing functions you own, repeated full-history scans. Document each fix with before/after times.
- Target: every Analytics tab section and exercise Charts tab under 150 ms warm on the synthetic dataset in Node; cold under 1 s. Report what you achieved.

### 5. Threads

- The worker already keeps the database off the main thread. Don't add more workers unless the benchmark shows main-thread work in rendering is the bottleneck; if so, report it rather than adding threads.

## Acceptance criteria

- [ ] `make format`; `make verify` passes (the benchmark is not part of `make verify`).
- [ ] Tests: cache returns identical results, invalidates on write, import and restore; `useDatabaseQuery` cache logic as a pure, tested module (LRU, version check, coalescing).
- [ ] Handoff lists before/after timings per call. Docs: ARCHITECTURE (cache ownership row, data version), DECISIONS (caching approach). Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

**Status:** implemented on `task/T-091-performance`, not committed. `make format` and `make verify` pass (218 files, 1416 tests). Smoke-tested in the browser at 430 × 932: creating a plan refreshes the Workout tab, Analytics renders, no console errors.

**Benchmark** (`make bench`, `tools/bench-analytics.ts`): seeded synthetic history, 953 workouts, 25,565 sets, 80 exercises, 3 plans, deload every 8th week, RPE on ~85% of sets. Calls go through the real `WorkerApi` in Node. Cold = straight after a write; warm = median of 5 repeats. The Mac was heavily loaded by parallel work (load average 5–17), so cold figures vary by ±30% between runs.

| Call (ms, cold / warm) | Before | After |
|---|---|---|
| Analytics 4W: overview / ranking / muscles / intensity / effort | 935/818 · 740/732 · 707/811 · 170/155 · 2/1 | 184/0 · 164/0 · 180/0 · 165/0 · 1/0 |
| Analytics 4W: muscle detail · pinned lifts · whole tab | 1637/4806 · 387/252 · 6471/7678 | 191/0 · 84/0 · 274/1 |
| Analytics 12W: overview · muscles · whole tab | 3300/1257 · 1564/3530 · 35007/11220 | 240/0 · 265/0 · 370/1 |
| Analytics 6M: overview · muscles · whole tab | 1591/1573 · 2636/1366 · 4471/5411 | 327/0 · 389/0 · 515/1 |
| Analytics 1Y: overview · muscles · muscle detail · whole tab | 2617/5401 · 1956/6020 · 4081/7477 · 6365/6904 | 385/0 · 505/0 · 731/0 · 780/1 |
| Analytics All: overview · ranking · muscles · intensity · effort | 5281/4898 · 2617/2116 · 2438/5822 · 472/444 · 64/65 | 501/0 · 405/0 · 981/0 · 542/0 · 66/0 |
| Analytics All: muscle detail · whole tab | 4310/4103 · 5332/5815 | 1661/0 · 1393/1 |
| Exercise page: strength · progress · charts · records · RPE chart · history page | 4/4 · 24/23 · 25/25 · 24/24 · 29/31 · 22/21 | 6/0 · 7/0.2 · 6/0.2 · 6/0.2 · 7/0.1 · 5/5 |
| Exercise Charts tab (detail, strength, charts, progress) | 56/57 | 10/0.4 |
| Plan: templateAnalytics · templateSessions | 1372/1368 · 156/155 | 508/76 · 140/0 |
| Workout: templateAnalytics · templateSessions | 102/100 · 40/39 | 110/12 · 43/0 |

Target: every Analytics section and the exercise Charts tab is under 150 ms warm (all ≤ 1.4 ms; plan analytics 76 ms). Cold is under 1 s everywhere except the **All** period: whole tab ~1.4 s and muscle detail ~1.7 s (see hot spots for the lead).

**What changed**
- Core: `Database.dataVersion` + `Database.cache` (`src/core/db/QueryCache.ts`, 600 entries, LRU, cleared on any version change). `historyBoundaryKey` (`src/core/queries/HistoryBoundary.ts`). New `ExerciseSessions` (`page`, cached `all`): the single SQL read of a lift's finished history, with the session lookup rewritten from a per-workout `EXISTS` to `w.id IN (SELECT workoutId … WHERE exerciseId = ?)` (906 → 19 ms for 80 lifts) and grouping by workout instead of filtering per session. `ExerciseCurve`, `ExerciseSeries.read`, `ExerciseStrength.series` and `TemplateSessions.read` are cached; curve and strength now derive from the cached history instead of their own queries (same rows, same order; a regression test compares with the old SQL).
- Worker: change listeners receive the data version; new `dataVersion()` method; whole-result caching for `analyticsOverview`, `strengthRanking` (shared `LiftTrends` result), `muscleDashboard`, `muscleDetail`, `intensityMix`, `weeklyEffort`, `exerciseEntries`, `exerciseDetail`. Inclusive-date calls key `to` by local day, so `new Date().toISOString()` callers (WeeklyCharts, MuscleDetailScreen full history) hit the cache.
- App: `useDatabaseQuery` now uses `QueryResultStore` (50 results, version check, one-minute reuse limit, request sharing, older reads never overwrite newer) and `ChangeCoalescer` (one refresh per frame, 100 ms when hidden), through one worker subscription. `QueryState` and `messageOf` are still exported from `database.ts`.
- `analyticsPeriod.ts` unchanged: ranges are already Monday-aligned, so keys are stable between mounts.
- `tsconfig.node.json` includes `WorkerApi.ts`, `OnDeviceStore.ts` and `analyticsPeriod.ts` so the benchmark type-checks. Makefile: `make bench`.
- Tests: `QueryCache.test.ts` (keys, LRU, versioning, rollback), `HistoryBoundary.test.ts`, `ExerciseSessions.test.ts` (equivalence with old SQL, invalidation), `WorkerApi.cache.test.ts` (warm = fresh, invalidated by a set change, worker writes, import and restore; reads leave the version alone), `QueryResultStore.test.ts`, `ChangeCoalescer.test.ts`.

**For the lead (outside this task's files)**
- All-period cold hot spots: `muscleCoverage` (~435 ms) and `weeklyMuscleVolume` (~480 ms) each return one row per set × muscle (~83k rows); SQLite steps them in ~40 ms, the rest is the WebAssembly boundary building row objects. Reading sets once (exerciseId, kind, rpe, startedAt) and expanding muscles from a small `exerciseMuscle` map in JS would cut rows ~3×. `MuscleDashboard` also runs one effort query per muscle (23 queries over the range). `intensityMix` does `trend.filter(...).at(-1)` per row (quadratic for All); a moving pointer would fix it.
- `PreviousPerformance.ts` (live logging) has the same correlated `EXISTS` lookup that was slow here; `LIMIT 1` hides most of the cost, but the same rewrite applies.
- `TemplateSessions.read` still does one `workoutDetail` per session cold (140 ms for a 300-session plan); now cached, but a set-based query would help cold plan pages. Its body was re-indented when wrapped in the cache (T-089 may see a conflict there).
- `ImportReviewStep` uses the key `'strong-import-counts'` without the plan: with remembered results, a second review within a minute and no write in between could briefly show the previous file's counts. Add a plan identity to the key.
- Main-thread rendering was not profiled; the benchmark shows the worker is no longer the bottleneck warm. No threads added.
