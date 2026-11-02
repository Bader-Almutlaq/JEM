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

_Fill in at the end of the session._
