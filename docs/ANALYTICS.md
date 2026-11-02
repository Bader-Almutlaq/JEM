# Analytics: where each view lives and what it shows

Agreed with the owner on 2026-11-01 (proposal page "JEM analytics plan", two review rounds). This is the design every analytics task follows. It replaces W6's screen list in `PLAN.md`.

## The idea

The owner sees progress **week by week, on one exercise, on one day of their plan**. So the detail lives where they train (plan → workout → exercise in that workout), and the **Analytics tab** separates the owner's pinned lifts from the overview, muscles and effort views.

Measure, don't prescribe: every figure describes ("+2.5% vs 4 sessions ago", "no new best in 6 weeks"), never a verdict.

## Levels

| Level | Where | Answers |
|---|---|---|
| Exercise in a workout | Workout page → tap an exercise (`WorkoutExercisePage`) | Am I progressing on this lift, on this day? |
| Workout | Workout page → Analytics tab | Is each exercise going up, flat or down? Are sets and effort changing? |
| Plan | Plan page → Analytics tab | Am I hitting my planned sets per muscle? Is every lift moving? |
| Everything | Analytics tab | Is my strength growing? Which muscles get the most work, lag, progress or stall? What's my effort? |

### 1. Exercise in a workout (and the exercise's own page)

- **No grid** (the owner rejected a week-by-set grid: sets are already visible in the workout and History).
- **Progress uses several measures, side by side:**
  - Tiles: **e1RM now** (smoothed trend), **best e1RM** in this scope (with its date), **top set** last session ("+20 kg × 8 @ RPE 8"), each with its change against 4 sessions ago (deloads left out).
  - Charts, one measure each: best-set e1RM per session, top-set weight, reps on the top set, working sets, average RPE. Tap a point for that session's sets. Deload sessions are yellow dots and never count in change figures.
- **Compare days:** when the exercise is in more than one saved workout, chips add the other workout as a second line on the e1RM chart (legend, at most 3 lines).
- The exercise's own page (Exercises tab) gets the same **By workout** chips.
- **RPE chart** on the exercise's Records tab, next to the rep-max table:
  - **%** view: the owner's reference chart (the RTS chart: RPE 10–5 in half steps down the side, reps 1–15 across), shown as a guide.
  - **kg** view: the same grid as weights for this lift from its current e1RM and **this lift's personal curve** (below), rounded to the lift's load step.
  - Cells where reps + RIR > 12 are muted (least reliable).

### 2. Workout (Analytics tab of a saved workout)

- Tiles: sessions done, **typical length** (median), working sets last session vs planned ("18 of 18").
- **Exercise progress:** a card per exercise with Est. 1RM (or top set), working sets and average RPE trends. Show the latest values and the change vs 4 non-deload sessions ago. Tap → level 1.
- **Hard sets per session** (bars, deload sessions yellow).
- **Effort per session**: average RIR of working sets, with RPE alongside (RIR 2 = RPE 8). Lower = harder.
- Removed: session volume and the single top-exercise chart.

### 3. Plan (Analytics tab of a plan)

- Tiles: **Workouts** (total finished sessions), **Per week** (recent window, one decimal, “of 3 planned”), **Typical length**. After more than seven days without a finished session, the Per week detail names the window (“4 wk to 12 Oct”).
- **Sets per muscle, per week:** bar = done (average over up to four Monday weeks ending with the latest finished session’s week), tick = planned (from the plan Summary). Tap a muscle → the exercises behind it.
- **Muscles:** the dashboard table for the recent plan window, with scoped strength, sets and effort. Tap for contributions.
- **Weekly hard sets** and **weekly effort** as two charts on the same weeks (never one chart with two scales).
- **Effort and reps:** rep ranges, effort and percentage of 1RM for the recent plan window.
- **Progress by workout:** the level-2 exercise rows grouped under each workout of the plan.
- Removed: session volume. Summary stays the planned view; Analytics is what was done.

### 4. Analytics tab (everything)

A segmented control under the title selects **Pinned · Overview · Muscles · Effort**, stored in `?tab=` so returning from a detail page restores the view. Default to Pinned when any lift is pinned, otherwise Overview; persist that resolved default before pin edits change it. The period (`?period=`, 4W, 12W, 6M, 1Y, All) is shared, with one row of chips under the control in each view, including Pinned so its changes can be compared directly.

- **Pinned:** larger lift cards with e1RM now, change over the selected period and a small trend. Pin from an exercise's ⋯ menu ("Pin to Analytics"); the card menu unpins or reorders it. Empty state suggests Squat, Bench Press and Deadlift (barbell) if they have history. The active plan row opens Plan analytics.
- **Overview:** workouts per week, typical length, hard sets per week and average effort (RIR, with RPE), each against the previous period. Strength shows a large **Typical lift** percentage, accessible up/flat/down chips, and the **Strength index** chart. One info sheet explains the figure and chips. Below it, lifts rank from biggest gain to biggest drop with sparklines; no new best e1RM in 6 weeks adds the muted note "no new best in 6 wk".
- **Muscles:** per main muscle: average fractional sets per week (bar), strength change (median e1RM change of exercises where it is primary), average RIR. Sorted by sets; rows under 4 sets a week are muted. "Show smaller muscles". Tap → muscle page: weekly sets, exercise contributions, strength by exercise, effort and rep-range mix.
- **Effort:** rep-range bars, effort bars labelled with RIR and RPE ("1 RIR · RPE 9"), **% of 1RM** mix, weekly hard sets and weekly average RIR as separate charts on the same weeks.

**Removed** (owner agreed): Time / week and Volume / week tiles; the 7-day vs 28-day "signature" chart; the Muscles tab paragraphs (not trained, neglected) and Frequency list; Balance ratios; the Intensity × volume dot chart; session volume charts on plan and workout pages.

## Definitions (one implementation each, in WorkoutCore)

- **Estimated 1RM:** report "recommended algorithms" items 1, 2 and 4 (already built: effective reps E = reps + RIR, e1RM = w × (1 + (E − 1)/k), smoothed trend).
- **Counted lift:** at least **two distinct finished non-deload sessions with a qualifying e1RM inside [period start, period end)**. Older history alone does not qualify a lift. A session containing a deload occurrence for the lift is excluded in full. Below-threshold lifts are absent from the strength headline, index and ranking, rather than represented as 0%. The shared query is `LiftTrends`.
- **Typical lift:** median of the counted lifts' percentage changes, each relative to its own smoothed e1RM baseline. Every lift gets one vote regardless of load. For +1%, +2%, +3%, the median is +2%; for four changes, average the two middle values. Baseline is the last smoothed value at/before period start, otherwise the first in-period value. No counted lifts gives no percentage.
- **Up / flat / down:** Heuristic: **within ±1%, including both boundaries, is flat**, allowing for roughly 1% day-to-day trend noise (`StrengthIndexPolicy.flatChangePercent`). Above +1% is up; below −1% is down. These are descriptive counts, without a training verdict.
- **Strength index:** Heuristic requested by the owner: weekly median of `(lift's current smoothed e1RM / its period baseline − 1) × 100`, equal weight per counted lift. Starts at 0%. A lift without a start-of-period trend joins at its first in-period value with its own zero baseline; it never contributes before that date. Carry the latest value forward between sessions. Deloads never enter the trend. Sample at period start, every seven local calendar days, and at the exclusive end minus 1 ms. Recompute membership for each selected period; a late entrant can change the median without any other lift changing. `strengthIndex` is pure; `strengthIndexReport` feeds it with the same eligible lift histories as the ranking. The chart uses last-value aggregation and a trend line.
- **Personal curve per lift (item 3, new):** once a lift has ≥ 10 qualifying **near-failure** sets (logged RPE ≥ 8 or failure; self-rated RPE is less accurate further from failure) at ≥ 2 effective-rep counts, fit k using only the best trial e1RM per effective-rep count in each 14-day window (Heuristic: top sets approximate a max and back-offs must not outvote them), then blend `k = (n × k_yours + 15 × k_start) / (n + 15)`, clamped 8–50. Unknown effort never enters fitting but still receives estimates. Below that, k_start by lift type. The owner asked for the best method, possibly per exercise; the report's answer is this personalisation. The RTS chart stays as the guide on the Records tab.
- **% of 1RM of a set:** weight ÷ the lift's e1RM on that date, where the reference is the larger of the trend and that session's best e1RM, so a set can never exceed 100%. (The old intensity map divided by a lagging trend and showed 133%.)
- **Recent plan/workout window:** up to four Monday calendar weeks ending with the latest finished session’s week, including that week; fewer weeks since the first session use only available weeks. Sessions per week, done muscle sets and contributions share this denominator. `windowEnd` is the inclusive local ISO Sunday; no history gives null.
- **Typical length:** median duration of finished sessions in scope, ignoring sessions over `SessionDurationLimits.maximumSeconds` (an imported workout left open made "Time / week" read 87 h).
- **Change vs 4 sessions ago:** compare the latest non-deload session with the 4th previous non-deload session in the same scope; omitted with fewer sessions.
- **Effort:** average RIR of completed working sets with logged RPE (RIR = 10 − RPE); sets without RPE are counted as "not logged".
- **Hard sets / fractional sets:** unchanged (`HardSets`, `MuscleVolume`).

## Chart rules (every chart)

Revised 2026-11-02 after the owner's iPhone review ("if you need to explain the chart, the chart is not good"). Reference: Strong's charts and Apple Fitness's readout. The system is specified in `docs/tasks/T-083-chart-system.md` and described in `DESIGN.md` → Charts.

- **No explanatory text.** A short title ("Estimated 1RM"), a y-axis with its unit, dates on the x-axis. No captions, takeaways, hints or notes under or over a chart.
- **Compact and aggregated.** Inline charts are small and show at most about 26 marks (session → week → month → quarter as the span grows). A dashed **trend line** (least squares) shows the direction on progress charts.
- A legend whenever two things are drawn (series, or a series and its trend), each in its own colour; a single series needs none.
- One scale per chart; two measures → two charts on the same dates.
- Deloads look the same everywhere (yellow points) and are left out of change figures and trend lines.
- Weeks with nothing logged are gaps, never zeros.
- **Press and drag** for values: a callout above the plot follows the finger and disappears on release.
- **Expand** opens the chart full screen in landscape (rotated when the phone is upright), with pinch to zoom and pan; aggregation follows the zoom. The table view lives there.

## Text on analytics screens

- Don't string facts together with " · " ("230 sessions · 878 sets · 3 warm-up sets"). Use labelled stat tiles, columns with a header, or chips.
- Say what a number measures once, in a column or tile label ("Est. 1RM", "vs 4 sessions ago"), not in a sentence.

## Build order

1. **T-077** (Codex Sol): personal curve, % of 1RM, RPE chart, exercise progress query, level 1 screens.
2. **T-078** (Codex Terra, parallel): Analytics tab rebuild with pins, typical length, removals.
3. **T-079** (after T-077): workout and plan Analytics tabs.
