# Task board

Check this first and update it last (see `docs/agents/WORKFLOW.md`). Newest milestone at the top.

**Current milestone:** W4, templates and calendar. Milestone branch: `web` (deployed from `main` with `make deploy`).
**Lead:** Claude Opus (main chat).

## W1: Strong import, History and backups

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| [T-013](T-013-units-models-settings.md) | Port units, row types and app settings to WorkoutCore | done | Claude Sonnet (subagent), reviewed by lead | merged |
| [T-014](T-014-strong-import-core.md) | Port the Strong importer and typo checks; `make import-report` | done (report matches the export exactly) | Claude Sonnet (subagent), reviewed by lead | merged |
| [T-015](T-015-history.md) | Port history queries; History list and workout detail screens | done | Claude Sonnet (subagent), reviewed by lead | merged |
| [T-016](T-016-backup-restore.md) | Back up through the share sheet; restore with a safety snapshot | done (share sheet checked in iOS Safari) | Claude Sonnet (subagent), reviewed by lead | merged |
| [T-017](T-017-import-flow.md) | Settings → Import from Strong: pick files, review, import, result | done (flow checked in the browser by lead; split into components in T-021) | Codex Terra (high), reviewed by lead | merged |
| [T-021](T-021-import-screen-components.md) | Split the import screen into small components | done | Codex Terra (high), reviewed by lead | merged |
| [T-018](T-018-hosting.md) | Publish the site and add it to the Home Screen | done: https://bader-almutlaq.github.io/workout-tracker/ (`make deploy`) | lead | `main` |

## W2: Exercise library (started early, in parallel with W1)

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| [T-019](T-019-library-and-search-core.md) | Port the library, muscle taxonomy and search (pure part) | done | Claude Sonnet (subagent), reviewed by lead | merged |
| [T-020](T-020-library-database.md) | Port library seeding, exercise editing and merge, catalog queries | done | Codex Terra (high), finished by lead | merged |
| [T-022](T-022-exercises-tab-and-matching.md) | Exercises tab and Strong matching screen | done | Claude Sonnet (subagent), reviewed by lead | merged |

## W3: Logging (started early)

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| [T-023](T-023-logging-core.md) | Port the logging core (live workout, previous performance, live typo check) | done | Codex Terra (high), reviewed by lead | merged |
| [T-024](T-024-workout-tab.md) | Workout tab: live logging screen | done | Claude Sonnet (subagent), reviewed by lead | merged |
| [T-025](T-025-backup-reminder.md) | Finish summary: quiet "Back up" line when the last backup is over 7 days old | done | Codex Terra (high), reviewed by lead | merged |
| [T-026](T-026-search-tie-breaks.md) | Search tie-breaks prefer common equipment | done | Codex Terra (high), reviewed by lead | merged |
| [T-027](T-027-rest-timer.md) | Rest timer on the logging screen | done | Claude Sonnet (subagent), reviewed by lead | merged |

## W4: Templates and calendar

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| [T-028](T-028-template-core.md) | Template engine: folders, templates, start from a template, save a workout as a template | done | Codex Terra (high), reviewed by lead | merged |
| [T-029](T-029-template-screens.md) | Template screens: list with folders on the Workout tab, editor, save-as-template | done | Claude Sonnet (subagent), reviewed by lead | merged |
| [T-030](T-030-history-calendar.md) | History calendar | done | Codex Terra (high), reviewed by lead | merged |
| [T-031](T-031-template-follow-ups.md) | Template follow-ups: reorder, discard prompt, seconds label | done (lead fixed timed targets landing in reps) | Codex Terra (high), reviewed by lead | merged |

## W5: Analytics engine

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| [T-032](T-032-e1rm-and-trend.md) | Effective reps, e1RM, session values and trend | done | Codex Sol (high), reviewed by lead | merged |
| [T-033](T-033-volume-and-baseline.md) | Hard sets per muscle, weekly volume, recent vs baseline | done | Codex Sol (high), reviewed by lead | merged |

## W6: Analytics screens

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| [T-034](T-034-strength-chart.md) | Strength chart on exercise detail + shared chart pieces | done | Codex Sol (high), reviewed by lead | merged |
| [T-035](T-035-analytics-muscles.md) | Analytics tab: weekly sets per muscle | done | Codex Terra (high), reviewed by lead | merged |
| [T-036](T-036-signature-chart.md) | Signature chart (recent vs baseline) on the Analytics tab, plus chart polish | done | Codex Sol (high), reviewed by lead | merged |

## Quality

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| [T-037](T-037-audit-data-safety.md) | Audit: no data loss | done (9 fixes, 34 tests) | Codex Sol (high), reviewed by lead | merged |
| [T-038](T-038-audit-data-accuracy.md) | Audit: data accuracy | done (6 fixes, 21 tests) | Codex Sol (high), reviewed by lead | merged |
| [T-039](T-039-e2e-fixes.md) | Fixes from the end-to-end check (set notes, warm-up prefill, template stamp, set counts, import preview) | done | Codex Terra (high), reviewed by lead | merged |
| [T-040](T-040-import-leave-out.md) | Leave out a flagged set at import | done | Codex Terra (high), reviewed by lead | merged |
| [T-041](T-041-backup-on-finish-and-one-tap-clean.md) | Backup button on every finish; leave out all flagged sets in one tap | done | Codex Terra (high), reviewed by lead | merged |
| [T-042](T-042-dropbox-backup.md) | Automatic backup to Dropbox (R11) | done (live Dropbox connect checked by owner) | Codex Sol + Terra (high), reviewed by lead | merged |
| [T-043](T-043-measurements.md) | Body measurements: sites with how-to notes, flexed/relaxed, history and change (R1) | done (polish in T-043b) | Codex Sol (high), reviewed by lead | merged |
| [T-044](T-044-loadable-weights-and-warmups.md) | Loadable weights + auto warm-up sets | done | Codex Sol (high), reviewed by lead | merged |
| [T-043b](T-043b-body-polish.md) | Body screen polish | done | Codex Terra (high), reviewed by lead | merged |
| [T-045](T-045-finish-comparison-and-bests.md) | Finish screen: compared with last time, personal bests | done | Codex Terra (high), reviewed by lead | merged |
| [T-046](T-046-search-by-muscle-words.md) | Plain-language exercise search (muscles, movements, equipment words) | done | Codex Terra (high), reviewed by lead | merged |
| [T-047](T-047-library-expansion.md) | Bigger library: free-exercise-db merge, instructions, pictures, smaller muscles | done (852 exercises) | Codex Sol (high), reviewed by lead | merged |
| [T-048](T-048-export-strong-csv.md) | Export workouts as Strong CSV (Hevy/Strong) and measurements CSV | done | Codex Terra (high), reviewed by lead | merged |
| [T-049](T-049-import-other-apps.md) | Import from Hevy, FitNotes and Fitbod through the Strong review | done (needs real-file check) | Codex Sol (high), reviewed by lead | merged |
| [T-050](T-050-edit-past-workouts.md) | Edit and delete past workouts in History (R12) | done | Codex Sol (high), reviewed by lead | merged |
| [T-051](T-051-import-app-chooser.md) | Choose the app before importing, with per-app export steps (R7) | done | Codex Terra (high), reviewed by lead | merged |
| [T-052](T-052-dropbox-connection-clarity.md) | Clear, restart-proof Dropbox connection with visible feedback (R11) | done | Codex Sol (high), reviewed by lead | merged |
| [T-053](T-053-warmups-opt-in-and-cable-steps.md) | Warm-ups only on request; cable add-on plate steps (R9) | done | Codex Terra (high), reviewed by lead | merged |
| [T-054](T-054-dropbox-redirect-connect.md) | Connect Dropbox by redirect, without copying a code (R11) | done | Codex Sol (high), reviewed by lead | merged |
| [T-055](T-055-measure-tab-and-long-range-charts.md) | Measure tab, Settings gear, long-range charts (R1, R0) | done | Codex Sol (high), reviewed by lead | merged |
| [T-056](T-056-live-workout-layout.md) | Strong-style live workout screen (R6) | done | Codex Sol (high), reviewed by lead | merged |
| [T-057](T-057-exercise-page-tabs.md) | Exercise page tabs: Summary, History, Charts, Records, How-to (R5) | done | Codex Sol (high), reviewed by lead | merged |
| [T-058](T-058-plans-and-workout-pages.md) | Plan pages and workout sheets with history and analytics (R4, R5) | done | Codex Sol (high), reviewed by lead | merged |
| [T-059](T-059-polish-after-redesign.md) | Polish after the redesign: PR step line, gear, plan return, chart height (R5, R6) | done | Codex Terra (high), reviewed by lead | merged |
| [T-060](T-060-progression-suggestions.md) | Opt-in progression suggestions, reps then weight, in amber (R5, R6) | done | Codex Sol (high), reviewed by lead | merged |
| [T-061](T-061-illustrated-exercise-pictures.md) | Illustrated exercise drawings where available (R2) | done | Codex Terra (high), reviewed by lead | merged |
| [T-062](T-062-deload.md) | Deload button, stored deload stages, shaded on charts (R13) | done | Codex Sol (high), finished and reviewed by lead | merged |
| [T-063](T-063-machine-brands.md) | Machine manufacturer per exercise, per-machine chart filter (R2/R5) | done | Codex Terra (high, three rounds), reviewed by lead | merged |
| [T-064](T-064-analytics-overview.md) | Analytics tab: views, period and the Overview (W6/R5) | done | Codex Terra (high), wired and polished by lead | merged |
| [T-065](T-065-muscle-coverage-intensity.md) | Muscle coverage and intensity sections for Analytics (W6) | done | Codex Terra (high), reviewed by lead | merged |
| [T-066](T-066-workout-page.md) | Workout page, plan workout cards, exercise-in-workout view (R4/R5) | done | Codex Terra (high), reviewed and polished by lead | merged |
| [T-067](T-067-tab-bar-drag-finish-checks.md) | Settings tab, past workouts into plans, accidental-workout checks (R4/R6) | done | Codex Terra (high), reviewed and extended by lead | merged |
| [T-068](T-068-workout-tab-plan-polish.md) | Workout tab, plan cards, plan charts, compact workout page (R4/R5) | done | Codex Terra (high), reviewed and polished by lead | merged |
| [T-069](T-069-plan-summary-active-plan.md) | Plan Summary (sets per muscle), workout day, active plan (R4) | done | Codex Terra (high), reviewed by lead | merged |
| [T-070](T-070-set-types-warmups-progression-button.md) | Compact editor, coloured set types, warm-ups on top, Progress button (R5/R6) | done | Codex Terra (high), reviewed by lead | merged |
| [T-071](T-071-exercise-info-line-compact-rows.md) | Exercise info line (rep range, rest, notes), Strong-sized rows (R6) | done | Codex Terra (high), reviewed by lead | merged |
| [T-072](T-072-uat-fixes-workouts-plans.md) | Test-pass fixes: workouts, plans, live workout | done | Codex Terra (high), reviewed and refined by lead | merged |
| [T-073](T-073-uat-fixes-measure-history-analytics.md) | Test-pass fixes: measurements, history, analytics | done | Codex Terra (high), reviewed by lead | merged |
| [T-074](T-074-strong-style-live-workout.md) | Strong-style live workout: continuous list, spaced rows, RPE on the pad (R6) | done | Codex Terra (high), reviewed by lead | merged |
| [T-075](T-075-deload-settings.md) | Deload settings: amount, by weight, sets or both (R13) | done | Codex Terra (high, two rounds), reviewed and fixed by lead | merged |
| [T-076](T-076-calf-raise-and-muscle-contributions.md) | Donkey Calf Raise records plain kg; tap a muscle to see its exercises | done | Codex Terra (high), reviewed by lead | merged |
| [T-077](T-077-strength-curves-and-exercise-progress.md) | Personal strength curve, RPE chart, exercise progress (analytics level 1) | done | Codex Sol (high), reviewed by lead | merged |
| [T-078](T-078-analytics-tab-rebuild.md) | Analytics tab rebuild: pins, overview, strength, muscles, effort | done (three rounds) | Codex Terra (high), reviewed by lead | merged |
| [T-079](T-079-workout-and-plan-analytics.md) | Workout and plan Analytics tabs | done (two rounds) | Codex Terra (high), reviewed by lead | merged |
| [T-080](T-080-analytics-tab-polish.md) | Analytics tab polish | done (lead fixed weekly chart labels) | Codex Terra (high), reviewed by lead | merged |
| [T-081](T-081-workout-plan-analytics-polish.md) | Workout and plan analytics polish | done | Codex Terra (high), reviewed by lead | merged |
| [T-082](T-082-estimate-and-data-fixes.md) | e1RM fit uses near-failure sets; lower traps; plan tiles; empty weeks as gaps | done (lead narrowed the fit after checking the real export) | Codex Sol (high), reviewed by lead | merged |
| [T-083](T-083-chart-system.md) | One chart system: compact, trend line, press-and-drag readout, landscape zoom | done (lead fixed bucket choice and session gaps) | Codex Sol (high), reviewed by lead | merged |
| [T-084](T-084-screen-polish.md) | Screen polish: no dot strings, muscles list, progress rows, pins, live boxes | done (two rounds; lead reworked the pin row, enabled .tsx tests) | Codex Terra (high), reviewed by lead | merged |
| [T-085](T-085-richer-workout-and-plan-analytics.md) | Workout cards with three trends; plan muscles and effort | done (lead trimmed text, top-set fallback) | Codex Terra (high), reviewed by lead | merged |
| [T-087](T-087-analytics-tabs-and-strength-index.md) | Analytics tabs back; typical lift change, up/flat/down, strength index | in progress | Codex Sol (high) | task/T-087-analytics-tabs |
| [T-088](T-088-chart-and-touch-polish.md) | Bright chart callout, table pill, wider plots; press feedback and transitions | in progress | Claude Sonnet (subagent) | task/T-088-chart-touch-polish |
| [T-089](T-089-workout-editor-and-preview.md) | Day tag, Targets dialog with ranges, progression in ⋯, workout preview | in progress | Codex Terra (high) | task/T-089-editor-preview |
| [T-090](T-090-automatic-progression-suggestions.md) | Automatic progression: weight first or reps first per exercise | open (after T-089) | | |
| [T-091](T-091-performance-and-caching.md) | Benchmark, worker cache, instant revisits, fewer refreshes | in progress | Claude Opus (subagent) | task/T-091-performance |

## Next milestones (tasks are written when the milestone starts)

- **On hold:** chart changes, until the owner has reviewed the charts (`docs/PLAN.md` → R0).
- **Owner's roadmap R1–R6** (`docs/PLAN.md` → *Roadmap*): measurements page, bigger library, exercise variants, programs, per-workout analytics, live-workout polish. Designed with the owner before tasks are written.
- **W6 (rest): Intensity × volume.** Rep-range mix, RIR histogram, intensity–volume map (`docs/PLAN.md` → analytics item 3).

## Done milestones

- **W0:** web skeleton: SQLite in a worker on the phone, migrations with snapshot, offline support, tokens, tabs, Appearance (branch `web`, 2026-10-30).

## Archived: native app (2026-10-29 → 2026-10-30)

Tasks T-001 to T-012 built M0–M3 natively in Swift. That code is the spec for W1–W3 (`reference/native/`, full history on branch `native-archive`). Their briefs stay in this folder for reference; T-004, T-005, T-009 and T-010 describe screens that W2–W3 rebuild, and T-010's number pad and set-row spec carries over unchanged.
