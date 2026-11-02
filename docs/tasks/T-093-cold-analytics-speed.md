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

**Status:** implementation ready for review, uncommitted. `make format` and `make verify` pass:
240 test files, 1,521 tests (10 added). **The cold All <400 ms performance goal is not met.**
No board edit, migration, worker API change or UI change.

**Files and public API**

- Added `src/core/queries/AnalyticsHistory.ts`: `AnalyticsHistory.sets`, `.muscles`, `.exercises`,
  plus read-only `AnalyticsSet` and `AnalyticsMuscle` types. This is an internal core read boundary;
  existing query signatures and worker-facing results are unchanged.
- Updated `MuscleCoverage.ts`, `WeeklyMuscleVolume.ts`, `MuscleDashboard.ts` (including `MuscleDetail`),
  `IntensityMix.ts`, `PreviousPerformance.ts` and `TemplateSessions.ts`.
- Added `AnalyticsHistory.test.ts`, six `*.equivalence.test.ts` files beside the rewritten queries,
  and `fixtures/ColdAnalyticsFixture.ts`. Previous implementations exist only inside the equivalence
  test files. Tests use real in-memory SQLite plus migrations, never a database mock.
- Updated `tools/bench-analytics.ts` to flag the 400 ms cold target, `docs/ARCHITECTURE.md` for the
  shared read owner, `docs/DECISIONS.md` for the approach and this Handoff.

**Implementation and interpretations**

- One completed-set SQL read per exact range and plan, with the connection's existing data-version
  invalidation. Muscle associations and exercise metadata are cached once per version. Coverage,
  dashboard effort, clipped weekly volume and intensity reuse matching reads. Warm-ups remain in the
  shared history; each consumer retains its original exclusions. Untagged exercises are not assigned
  invented muscles. Deload behavior is unchanged.
- Dashboard effort is grouped from the shared rows instead of 23 separate SQL scans; summary/detail
  reuse the same lift calculation. Weekly volume uses canonical `muscleVolume` for all counting.
- Chose the permitted binary search for intensity instead of a moving pointer: no future local-date
  trend is used, including repeated same-day sessions. Session-best fallback is unchanged.
- Only one correlated membership `EXISTS` remained in `PreviousPerformance`: the general predecessor
  fallback. Rewrote it to `IN`; the other history lookups already use exercise-indexed joins. Correlated
  occurrence counting is retained because it implements repeated-entry/machine matching.
- Implemented the optional set-based `TemplateSessions.read`; empty sessions, duration edge cases,
  order, current membership, set counts, volume and top-exercise estimates match the old detail loop.
- Equivalence covers deloads, warm-ups, drops, failure with conflicting RPE, unknown/low/half-step effort,
  incomplete and live sets, custom and untagged exercises, out-of-order insertion, tied shares, same-day
  sessions, empty scopes, partial weeks, secondary weights and predecessor brands/occurrences.
  Cache tests also prove one shared read and invalidation of sets, names and associations after edits.

**Benchmark**

Synthetic history only: 953 workouts, 25,565 sets, 80 trained exercises, 3 plans. Each cell is
`before cold/warm → after cold/warm`, in ms; warm is the median of five repeats. Timings are single
cold samples and vary with machine load. The final run was after full verification finished.

The plain `make bench` launch initially failed with sandbox `EPERM` when the `tsx` CLI opened its IPC
socket. Baseline used `node --import tsx tools/bench-analytics.ts`; final used `make bench` with a temporary
`npx` launcher outside the repository that invokes that same Node loader. The benchmark code, real
worker API, SQLite engine and synthetic dataset are unchanged by the launcher. No network was needed.

| Call | 4W | 12W | 6M | 1Y | All |
|---|---|---|---|---|---|
| analyticsOverview | 216.8/0.0 → 179.9/0.0 | 265.4/0.0 → 230.8/0.0 | 357.9/0.0 → 318.7/0.0 | 590.3/0.0 → 375.5/0.0 | 563.4/0.0 → 423.1/0.0 |
| strengthRanking | 182.2/0.0 → 159.6/0.0 | 252.6/0.0 → 221.6/0.0 | 338.3/0.0 → 302.4/0.0 | 404.8/0.0 → 344.1/0.0 | 488.9/0.0 → 361.0/0.0 |
| muscleDashboard | 191.2/0.0 → 177.2/0.0 | 293.8/0.0 → 244.1/0.0 | 418.0/0.0 → 336.3/0.0 | 578.8/0.0 → 395.3/0.0 | 968.1/0.0 → 519.6/0.0 |
| intensityMix | 181.2/0.0 → 173.8/0.0 | 266.9/0.0 → 246.0/0.0 | 368.9/0.0 → 335.6/0.0 | 432.8/0.0 → 396.4/0.0 | 578.0/0.0 → 516.1/0.0 |
| weeklyEffort | 1.5/0.0 → 1.4/0.0 | 3.9/0.0 → 3.4/0.0 | 8.3/0.0 → 7.7/0.0 | 16.2/0.0 → 14.9/0.0 | 68.1/0.0 → 60.1/0.0 |
| muscleDetail (chest) | 203.4/0.0 → 174.4/0.0 | 340.3/0.0 → 253.6/0.0 | 524.4/0.0 → 352.6/0.0 | 820.1/0.0 → 429.3/0.0 | 1584.2/0.0 → 661.8/0.0 |
| pinned lifts (entries, detail, strength) | 89.3/0.0 → 84.1/0.0 | 87.2/0.0 → 79.3/0.0 | 86.2/0.0 → 77.6/0.0 | 90.3/0.0 → 76.8/0.0 | 82.4/0.0 → 77.1/0.0 |
| whole tab (as the screen loads it) | 297.2/1.3 → 264.2/1.4 | 408.6/1.4 → 337.9/1.3 | 689.3/1.4 → 440.8/1.3 | 744.0/1.3 → 533.9/1.3 | 1309.5/1.3 → 773.6/1.2 |

Exercise page (most trained exercise, id 1)

| Call | Before cold/warm | After cold/warm |
|---|---|---|
| exerciseDetail | 3.2/0.0 | 3.8/0.0 |
| exerciseStrength | 5.8/0.0 | 5.4/0.0 |
| exerciseProgress | 7.2/0.2 | 5.8/0.2 |
| exerciseCharts | 6.3/0.2 | 5.8/0.2 |
| exerciseRecords | 6.3/0.2 | 6.3/0.2 |
| exerciseRpeChart | 8.3/0.1 | 6.0/0.1 |
| exerciseHistory (first page) | 5.1/4.7 | 4.4/4.2 |
| Charts tab (detail, strength, charts, progress) | 10.2/0.4 | 8.6/0.4 |

Plan and workout pages

| Call | Before cold/warm | After cold/warm |
|---|---|---|
| templateAnalytics (plan) | 503.4/71.3 | 360.9/43.2 |
| templateSessions (plan) | 143.3/0.0 | 38.0/0.0 |
| templateMuscleSummary (plan) | 1.1/0.9 | 1.1/0.9 |
| templateAnalytics (workout) | 102.9/11.6 | 71.4/10.1 |
| templateSessions (workout) | 41.7/0.0 | 17.9/0.0 |
| exerciseProgress (workout scope) | 8.7/0.1 | 7.9/0.1 |

**Remaining performance gap / review notes**

- All cold: overview 423 ms, ranking 361 ms, muscles 520 ms, intensity 516 ms, effort 60 ms,
  chest detail 662 ms, combined tab 774 ms. All whole-result warm reads remain below 0.1 ms;
  combined tab warm is 1.2 ms. Plan sessions fell 143 → 38 ms; workout sessions 42 → 18 ms.
- A separate instrumented synthetic muscle-detail read (~754 ms including instrumentation) spent
  211 ms across 80 canonical `ExerciseSessions` full-set reads (25,565 rows), 119 ms on the shared
  period read (25,565 rows) and 61 ms on the two session-aware `WeeklyEffort` reads. Remaining cold
  work also includes curve/trend calculation and TypeScript grouping. Further improvements should
  profile the canonical strength-history boundary before broadening this change; no duplicate
  strength implementation or additional worker was introduced.
- No phone/Safari performance claim: these measurements are Node/WebAssembly. No visual changes
  require screen checks. Production build retains the existing bundle-size/dynamic-import warnings.
