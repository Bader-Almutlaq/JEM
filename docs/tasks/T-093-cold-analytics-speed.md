# T-093: Faster first load of long analytics periods

- **Milestone:** Performance · **Depends on:** T-091 (merged) · **Model tier:** high (Codex Sol)

## Goal

T-091 cached results, so revisits are instant. A period's **first** load (straight after a write) is still slow for long ranges on the owner-scale benchmark: Analytics **All** about 1.4 s, muscle detail **All** about 1.7 s. Get every Analytics tab section and the muscle page under **400 ms cold for All** in `make bench`, with identical results.

## Read first

- `AGENTS.md`, `docs/ARCHITECTURE.md` (query cache, data version), T-091's task file (Handoff: the hot spots below and the benchmark table).
- `tools/bench-analytics.ts` (`make bench`), `src/core/queries/MuscleCoverage.ts`, `WeeklyMuscleVolume.ts`, `MuscleDashboard.ts` (+ `MuscleDetail`), `IntensityMix.ts`, `PreviousPerformance.ts`, `TemplateSessions.ts`, their tests, `src/core/analytics/MuscleVolume.ts` (fractional sets).

## Specification

1. **Run `make bench` first** and record cold/warm for every Analytics call at 4W, 12W, 6M, 1Y and All, plus muscle detail and plan/workout analytics.
2. **Set × muscle rows:** `MuscleCoverage` and `WeeklyMuscleVolume` return one row per set per muscle (~83k rows for All); most time is building row objects across the WebAssembly boundary. Read each completed set **once** (only the columns needed) and expand muscles in TypeScript from a small `exerciseId → [{muscle, role}]` map read in one query (cache the map by data version). Same outputs, about 3× fewer rows.
3. **`MuscleDashboard` / `MuscleDetail`:** replace the one-effort-query-per-muscle loop (23 queries) with one query grouped in TypeScript.
4. **`IntensityMix`:** `trend.filter(...).at(-1)` per set is quadratic over long ranges; walk sets and the trend together in date order with a moving pointer (or a binary search).
5. **Share work inside one Analytics load:** if several sections read the same per-set rows for the same range, read them once through the query cache (keyed by range + data version) and derive each section from it. Don't change the worker API.
6. **`PreviousPerformance.ts`:** apply T-091's rewrite (`w.id IN (SELECT workoutId … WHERE exerciseId = ?)` instead of a per-workout `EXISTS`) to its lookups; it runs during live logging.
7. **`TemplateSessions.read`** (cold plan pages, ~140 ms for 300 sessions): one set-based read instead of one `workoutDetail` per session, if it's simple; skip with a note otherwise.
8. **Equivalence:** for each rewritten function, a test that the new result equals the previous implementation's result on a synthetic history with deloads, warm-ups, drop and failure sets, unknown RPE, exercises with no muscles and custom exercises. Keep the old implementation only inside the test file (as a reference), not in `src`.
9. Report before/after in the Handoff. No migration unless an index clearly helps (then the next free number, v18).

## Acceptance criteria

- [ ] `make format`; `make verify` passes; `make bench` shows All-period sections and muscle detail under 400 ms cold (report what you reach if not).
- [ ] Equivalence tests for every rewritten query.
- [ ] Docs: DECISIONS (what changed and why), ARCHITECTURE if ownership changed. Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

_Fill in at the end of the session._
