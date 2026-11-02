# T-087: Analytics tabs back, and a clear "am I getting stronger?" answer

- **Milestone:** Analytics redesign, round 3 (`docs/ANALYTICS.md`) · **Depends on:** T-085 · **Model tier:** high (Codex Sol)
- **Runs in parallel with T-088** (charts and touch polish: owns `src/app/design/*`), **T-089** (workout editor: owns `src/app/features/templates/*`, `src/app/features/workout/*`, template core, migrations) and **T-091** (performance: owns `src/app/data/*`, `src/worker/*`, query caching). You own `src/app/features/analytics/*` and the strength queries in core (`LiftTrends.ts`, `StrengthRanking` or wherever the ranking lives, a new `StrengthIndex.ts`). Don't change `useDatabaseQuery` or the worker plumbing beyond adding your one new worker method.

## Goal

The owner's iPhone review (2026-11-02, second round):

1. **Bring the top tabs back.** "Everything now is in a single page. I would bring back the pages on the top… and then the dashboard, which is the pinned. I would not combine them in a single one, so I could switch views between the pinned analytics that I like and the normal analytics page."
2. **The Strength headline is unclear and doesn't answer the question.** "Median change across 22 lifts: +0.0% over 12 weeks… what do you mean median change? … Analytics should show whether I am progressing overall or not… many muscles are halting while others are gaining… across all exercises, obviously relative, because with absolute weight a larger exercise would take all the credit. Am I gaining strength in general?"
3. Several lifts show **0.0% with a flat line** (Bayesian Cable Curl, Bent Over Row, Calf Press): lifts with too little data in the period are counted as "no change", which drags the median to 0.0%.

## Read first

- `AGENTS.md`, `docs/ANALYTICS.md` (level 4, definitions, chart and text rules), `docs/DESIGN.md` → Charts (TimeChart).
- `src/app/features/analytics/` (AnalyticsScreen, AnalyticsDashboard, PinnedLifts, ActivePlanRow, PeriodChips, SummaryTiles, StrengthSection, LiftTrendList, MuscleDashboardTable, EffortAndReps), `src/core/queries/LiftTrends.ts` (+ tests), the ranking query, `src/core/analytics/EstimatedOneRepMax.ts` (smoothed trend), `src/app/design/components/SegmentedControl*`.

## Specification

### 1. Tabs

- A segmented control under the Analytics title: **Pinned · Overview · Muscles · Effort**. The selected tab is in the URL (`?tab=`), so back navigation returns to it. Default: Pinned when at least one lift is pinned, else Overview.
- **Pinned:** the pinned lift cards (as today, larger now that they have the page: each card shows e1RM now, change over the selected period, and a small trend), the suggestion chips when nothing is pinned, and the active plan row.
- **Overview:** period chips, overview tiles, Strength (below).
- **Muscles:** period chips, the muscles table (rows open the muscle page as today).
- **Effort:** period chips, Effort and reps (rep ranges, effort, % of 1RM, weekly hard sets, weekly effort).
- Period chips appear once per tab, under the segmented control, and the choice is shared across the three tabs (keep it in the URL as today).

### 2. Which lifts count

- A lift counts toward strength figures for a period only with **at least 2 non-deload sessions with an e1RM in the period** (or the lift's trend has a value at both the period start and end, if that's how `LiftTrends` already works; pick one and document it). Lifts below that are left out of the headline, the index and the ranked list (not shown as 0.0%). Add the rule to ANALYTICS.md Definitions.

### 3. Strength headline: "Are you getting stronger?"

Replace "Median change across N lifts: +x% over 12 weeks" with a compact block:

- **Big number: typical lift change**, e.g. "+3.2%", labelled "Typical lift" (small caption under the number). It is the **median of each counted lift's percentage change** over the period, so each lift counts equally, whatever it weighs. (Answer to the owner's question, for the doc: with three lifts changing +1%, +2% and +3%, the typical lift is +2%, the middle value; with four, the average of the middle two.)
- **Count chips** beside it: "▲ 14", "▬ 5", "▼ 3" (up, flat, down), coloured with the existing signed colours (flat neutral). Flat means within ±1% (`Heuristic:` the e1RM trend's day-to-day noise is around a percent; name the constant). Each chip has an accessible label ("14 lifts up").
- A small ⓘ button opens a sheet explaining in three short lines what "typical lift" and the chips mean (this is the one place an explanation lives).
- **Strength index chart** under it (TimeChart, line, unit "%", trend on): for each week in the period, the median across counted lifts of (the lift's smoothed e1RM that week ÷ its smoothed e1RM at the period start − 1) × 100. A lift contributes from its first trend value in the period, carrying its last value forward between sessions. Starts at 0%. Title "Strength index". This shows whether overall strength is rising, flat or falling over time. Core: `src/core/analytics/StrengthIndex.ts` (pure, from per-lift dated trend values) and a query that feeds it, with a `Heuristic:` note (median of relative changes, so no single heavy lift dominates; the owner asked for relative).
- Then the ranked list as today (biggest gain to biggest drop), with the "no new best in 6 wk" note.

### 4. Tests

- Core, hand-computed: lifts with fewer than 2 sessions excluded; median for odd and even counts; flat threshold at exactly ±1%; strength index for three synthetic lifts over 4 weeks including one that starts mid-period and one with a deload.
- App: tabs render and switch by URL; Pinned is default with pins and Overview without; the headline shows the big number, three chips and the ⓘ sheet; no "Median change across" text.

## Acceptance criteria

- [ ] `make format`; `make verify` passes.
- [ ] Docs: ANALYTICS.md (level 4 tabs, Definitions: counted lifts, typical lift, flat, strength index), DESIGN.md if the look changed, DECISIONS.md (tabs return; strength index). Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

_Fill in at the end of the session._
