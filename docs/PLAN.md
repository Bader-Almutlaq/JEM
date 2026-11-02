# Workout Tracker: build plan

A personal iPhone workout tracker (an offline web app on the Home Screen) to replace Strong. It keeps 4 years of Strong history, has a much larger exercise library, makes building workouts easy, and gives deep, science-based analytics. Research behind every decision: `reports/Workout tracker app research.md` (details in `research_notes/`).

## Principles

- **Measure, don't prescribe.** The app records and calculates. Training decisions stay with the user. Progression rules are opt-in, per exercise, defined by the user.
- **Literature, not hype.** Every metric must trace to a cited source in the report, or be labelled as a descriptive heuristic.
- **Excluded:** AI features, exercise videos/animations, social, streaks, celebrations, accounts, cloud.
- **Not cluttered.** Logging needs 2–3 taps per set, with last session's numbers always visible inline.
- **Data is irreplaceable.** Never lose a set. One-tap backups to iCloud Drive, with the last-backup date always visible (see `docs/DATA.md`). Keep the original Strong CSV forever.
- **Engineering standards** are in `AGENTS.md`; agent workflow in `docs/agents/WORKFLOW.md`; tasks in `docs/tasks/BOARD.md`; structure in `docs/ARCHITECTURE.md`; visual system in `docs/DESIGN.md` (Linear-inspired).

## Platform and install

- **An offline web app on the iPhone Home Screen** (open the site in Safari → Share → Add to Home Screen). It runs full-screen like an app, works with no connection, and never expires. Switched from native on 2026-10-30 (see `docs/DECISIONS.md`).
- All data stays on the phone, in the Home Screen app's private storage. **Deleting the Home Screen icon deletes the data**, so backups matter (see `docs/DATA.md`).
- Hosted on GitHub Pages at https://bader-almutlaq.github.io/JEM/ (code only, never data). Publish with `make deploy`.
- Updates download in the background and wait for a tap ("Update ready"), so the app never reloads mid-workout.

## Architecture

- **WorkoutCore** (`src/core`): pure TypeScript with no UI. It holds the models, database and migrations, the Strong importer, the exercise library, search, logging and every analytics formula. Tested with Vitest (`make test`).
- **Database worker** (`src/worker`): opens SQLite (WebAssembly build) on the phone's private file system and exposes WorkoutCore to the screen through one typed API.
- **Screens** (`src/app`): React, rendering only. Linear-style design tokens in CSS.
- **Storage:** SQLite, the same schema as the native app. Analytics run as SQL over 20k+ sets.
- **Units:** weights stored in kg exactly as entered, with the unit typed; display unit per exercise.

### Data model (first pass)

| Table | Key fields |
|---|---|
| `muscle` | id, name, group, region. About 20 muscles, with front/side/rear delts split |
| `exercise` | id, name ("Movement (Equipment)"), equipment, pattern, mechanic, libraryKey, lengthened-bias flag, tracking kind, source (library / custom / strong), default entry unit, archived |
| `exercise_muscle` | exercise_id, muscle_id, role (primary 1.0 / secondary 0.5) |
| `exercise_alias` | exercise_id, alias: names merged from Strong (built-in slang lives in `library.json`) |
| `workout` | id, start, end, name, notes, template_id, block_id, source (strong / app) |
| `workout_exercise` | id, workout_id, exercise_id, position, superset_group, notes |
| `set` | id, workout_exercise_id, order, type (warmup / working / drop / failure), weight_kg, entry_unit (kg / lb), reps, rpe, rir, duration_s, distance_m, side (both / L / R), rest_before_s, completed_at, notes |
| `template_folder`, `template`, `template_exercise`, `template_set` | Folders, ordered exercises, default sets/reps/RIR/rest, supersets |
| `block` | id, name, goal, start, end, notes |
| `bodyweight` | date, kg |
| `measurement` | date, site (arm L/R, chest, waist, thigh L/R, calf L/R…), cm |
| `import_mapping` | strong_name → exercise_id (saved so re-imports land the same way) |
| `progression_rule` | exercise_id, kind, params (opt-in only) |
| `equipment_profile` | plates, dumbbell list, machine steps (for the calculator) |
| `setting` | key, value |

## Milestones

Milestones are numbered W (web). W1–W3 port what the native app already had; `reference/native/` is the spec. Each milestone ends with `make verify` passing, every screen checked at iPhone 15 Pro Max size in dark and light, and a run in Safari on the simulator.

### W0: Web skeleton (done)
- Vite + React + TypeScript, ESLint layer rules, Vitest. SQLite in a worker on the phone's private file system; `v1-schema` migration; snapshot before migrating.
- Offline support and "Update ready"; Home Screen icon and manifest; design tokens (dark and light); five tabs; Settings → Appearance.

### W0b: Hosting (needs the owner)
- Publish the site on a free static host with HTTPS, then add it to the Home Screen. Deploying is one `make` command.

### W1: Strong import, History and backups
- Port units, the CSV and Strong parsers, the unit resolver, typo checks, the reviewable import plan and the importer (snapshot first, one transaction); `make import-report` on the real export must match `docs/DATA.md` exactly.
- Import flow in Settings; History list and workout detail.
- Backups: one-tap backup to Files / iCloud Drive through the share sheet; restore from a file with a safety snapshot first; last-backup date always visible.

### W2: Exercise library and search
- Port the curated library (420 exercises), seeding, name and alias resolution, custom exercises, merge, search with slang and typo tolerance, catalog queries.
- Exercises tab (browse, search, filters, detail, custom exercises) and the Strong matching screen.

### W3: Logging
- Port the logger, previous performance, the live workout query and the live typo check.
- Workout tab: previous values inline, pre-filled sets, large number pad with kg/lb toggle, finish summary, "Is this right?" prompt.
- Rest timer (on screen; alerts while locked are limited on the web, see `docs/DECISIONS.md`). Plate and warm-up calculators.

### W4: Workouts and templates
- Folders, drag to reorder, supersets, defaults per exercise, duplicate, start from a template or from any past session.
- Calendar and full history.

### W5: Analytics engine (in `WorkoutCore`, fully unit-tested)
- Effective reps E = reps + RIR (RIR = 10 − RPE; unknown → 2, lower weight).
- e1RM = w × (1 + (E − 1)/k), k by category (38 / 29 / 24 / 20 / 15). Qualifies if not a warm-up, E ≤ 12, RIR ≤ 4.
- Trend: EWMA, α = 1 − e^(−days/τ), τ 14–21 d; hold sessions >15% off the trend.
- Fractional hard sets (primary 1.0, secondary 0.5 or 0.3 setting; hard = RIR ≤ 4), zones <4 / 4–10 / 10–20 / 20–30 / >30, per-session flag >11.
- Relative intensity, rep-range buckets, RIR histogram, intensity–volume points, frequency, balance ratios, drop-off, bodyweight trend, block change (formulas in report section 12).

### W6: Analytics screens
1. **Exercise detail:** e1RM trend, rep-max table, reps at fixed load, like-for-like filters (position, rep range, rest), history.
2. **Muscles:** weekly sets direct vs indirect, body map, frequency, neglected list, balance ratios, exercise share per muscle.
3. **Intensity × volume:** rep-range mix, RIR histogram, intensity–volume map.
4. **Session summary**, **weekly report**, **block comparison**, **all-time** view.

### W7: Body
- Bodyweight with trend; measurements with L/R; strength relative to bodyweight; e1RM and bodyweight overlay.

### W8: Optional (pick later)
- Load calculator (weight for planned reps × RIR from your trend, rounded to your equipment).
- User-defined progression rules per exercise (double progression, RIR target, % e1RM, top set + back-offs), off by default.
- Stall flag with a user threshold; RIR calibration from failure sets; personal k per lift; lengthened-bias share chart.

## Roadmap: owner's requests (2026-10-30)

Short entries from the owner's review; each gets a design pass with the owner before tasks are written. Order is not decided yet.

- **R0. Charts on hold.** Don't change any chart until the owner has tried them on the phone and given feedback. Open point for that review: the Estimated 1RM headline treats a jump of more than 15% as a probable typo and holds it until confirmed. After a long break (e.g. 104.8 → 131 kg), the headline keeps showing the old value.
- **R1. Measurements page.** Its own screen (like Strong), reachable from the tab bar or Analytics. Each site has a "where and how to measure" note the owner writes (e.g. "waist: at the belly button, tape snug, relaxed"). Muscle sites can be logged **flexed and relaxed**. Tap a site → its history, a chart and its change (since the first entry and over recent weeks); log a new value. Sites cover the body parts the owner tracks (Strong's 15 plus flexed/relaxed pairs). Bookkeeping only, nothing fancier. *Today:* imported Strong measurements are stored (`bodyMeasurement`), but there is no screen. Replaces W7's measurement part.
- **R2. Bigger exercise library with descriptions** (and images if feasible offline). Look for an open, licence-compatible dataset to merge in; keep primary and secondary muscles, which drive the volume maths. *Today:* 420 curated exercises, no descriptions or images.
- **R3. Exercise variants.** The same movement on different machines (Panatta vs Nautilus chest press), with different grips or attachments, progresses differently. Record a **machine name** (brand/model) and an **attachment** (rope, V-bar, wide bar…) and grip. Distinct movements are already distinct exercises (bench vs incline). Open question: model a brand, grip or attachment as a variant tag that splits progression, or as separate exercises.
- **R4. Programs → workouts → exercises.** A program (e.g. "Upper/Lower") holds its workouts (e.g. "Upper A, Wednesday"), each holding exercises. *Today:* template folders → templates, and workouts started from a template remember it (`workout.templateId`), so this is largely a rename plus the analytics in R5.
- **R5. Analytics by view.**
  - **From an exercise:** performance across everything (e1RM, which is load-independent).
  - **From a workout:** progression within that workout, session to session. The same exercise done heavy on one day and light on another must not be mixed, and switching to a lighter load must not wreck the trend (Strong's weakness).
  - A program-wide overview is secondary.
- **R6. Live workout panel: keep Strong's strengths, fix its annoyances.**
  - Free order: never lock the owner into the current exercise.
  - Per-exercise notes, with room for an optional attachment (photo).
  - Rest is optional and never auto-inserted into new sets.
  - Warm-up sets are visually distinct across the whole row and excluded from volume. Failure sets, drop sets and supersets each get a clear look, not just a letter flag.
  - RPE **or** RIR entry.
  - Solid kg ↔ lb handling.
  - "Last time" shows load, reps and effort, not just the weight. Any suggestion stays opt-in (see the product rules).
  - Show the template's target reps and RPE on the live workout screen (today they appear only on the start sheet; reps prefill from last time).
  - The same exercise twice in a program with different rep ranges (heavy day vs light day) is tracked apart (see R5).
  - The owner can send Strong screenshots as a reference.

- **R7. Import from other apps.** Strong works today. Add Hevy next, then other common trackers whose exports are documented. Each importer reuses the review step: unit check, flagged sets, leave out.
- **R8. Export.**
  - The full backup already exists (one SQLite file).
  - Add CSV exports in **Strong's format**, which Hevy and most trackers can import, and in **Hevy's format**.
  - Check each round trip by importing the export into the real app where possible.
- **R9. Warm-ups.** Warm-up sets look distinct and never count toward volume or hard sets; the counting part is done (T-039). *To confirm with the owner:* whether "warm-up feature" also means generating warm-up sets automatically (a ramp up to the first working weight), off by default.
- **R10. Effort: RPE and RIR.**
  - Enter effort as RPE or RIR (one setting; stored once, as RPE).
  - Show an RPE-over-time chart per exercise.
  - Show an RPE estimate: "100 kg × 8 is about RPE 8 for you", from the e1RM trend. Descriptive, never a prescription.
- **R11. Automatic backup.** Today a backup is one tap, with a reminder after 7 days. The owner wants it fully automatic. A web app can't write to iCloud Drive silently, so it needs a cloud the owner signs into once. Decision pending: see *Needed from the user*.
- **R12. Edit past workouts.** History is read-only today, so a typo after import or after finishing can't be fixed. Allow editing and deleting sets and workouts in History, taking a snapshot first, and run the typo check when editing.
- **R13. Deload marker (to discuss).**
  - A button starts a deload.
  - The app proposes a deload from the research report (volume and intensity reductions, length), opt-in and editable.
  - Charts colour the deload weeks so a planned dip reads as a deload, not a loss of performance.

### Build waves (lead plan, 2026-10-31)

Proposals and details: `docs/design/PROPOSALS.md`.
- **Wave 1 (building):** T-042 Dropbox backup (with a bring-your-own-key setting); T-043 measurements (Analytics → Body, flexed/relaxed, how-to notes, change).
- **Wave 2:** T-044 loadable weights + warm-up generator; T-045 finish comparison + personal bests; T-046 exercise search.
- **Wave 3:** T-047 library expansion (free-exercise-db + wger, descriptions, pictures, smaller muscles; migration after T-043's v4); T-048 exports (Strong/Hevy CSV); T-049 imports (Hevy, FitNotes, Jefit, Fitbod).
- **Waiting for the owner:** analytics structure, machines/attachments, exercise-quality tags, deload, progression, RPE/RIR (PROPOSALS 7–11, 13); workout-screen layout (needs Strong screenshots).

## Needed from the user

- [x] Strong export (in `export_data/`, git-ignored).
- [x] **Hosting:** GitHub Pages, public repository (2026-10-30).
- [ ] Optional: Strong screenshots as UI reference.
- [ ] Preferred effort scale (RPE or RIR).
- [x] App display name: **JEM** (owner, 2026-10-31).
- [x] **Automatic backup (R11): Dropbox (owner, 2026-10-31).** Still needed: the app key from the owner's Dropbox app (App Console). Original question: which cloud the app may send backups to (e.g. Dropbox or Google Drive, free, signed in once; or iCloud via CloudKit, which needs a paid Apple Developer account). This relaxes "nothing leaves the phone" for the owner's own cloud only.
- [ ] Warm-up generator wanted? (R9)

## Status

- 2026-10-29: research done, plan written. Docs and engineering rules written.
- 2026-10-29: **M0 code complete.** WorkoutCore: schema v1, snapshot-before-migrate, units (kg/lb, display snapping, entry-unit inference), backups (iCloud folder bookmark, coordinated writes, 15-min throttle, daily/monthly retention, validated restore with safety snapshot). 23 tests pass (`make test`). App: Linear-style tokens, tab shell, Settings → Backups/Restore; `make build` passes with no warnings.
  - Not yet verified: running on a simulator (no iOS simulator runtime downloaded) or on the iPhone (needs `Config/Local.xcconfig` with the team ID). The iCloud folder flow can only be checked on a real device or simulator.
  - Export profiled: per-exercise unit switching explains the odd weights (see `docs/DATA.md`). Owner's unit preference recorded: log in each exercise's unit, analytics in kg.
- 2026-10-29: **M1 code complete** (branch `m1-strong-import`). Parsers for both Strong layouts and measurement files, per-exercise unit detection, typo detection with suggestions, a reviewable import plan, an idempotent importer (snapshot first, one transaction), and history queries. App: Settings → Import from Strong (pick files → review units and flagged sets → import → result) and a live History tab with a workout detail screen. 58 tests pass; app builds with no warnings. Dry run on the real export matches it exactly (see `docs/DATA.md`).
  - Not yet verified: the import and History screens running on a device or simulator.
  - Deferred to M2: matching Strong names to library exercises (see `docs/DECISIONS.md`).
- 2026-10-30: **M2 core done** (branch `m2-exercise-library`): curated library (420 exercises), muscle taxonomy, schema v2, seeding at launch, name/alias resolution, custom exercises and merge (snapshot first), search, catalog queries. 112 tests pass; app builds. Agent workflow added (`AGENTS.md`, `docs/agents/WORKFLOW.md`, `docs/tasks/`).
  - Remaining M2 work is on the task board: Exercises tab, Strong matching screen, app icon.
- 2026-10-30: **Switched to an offline web app** (owner: no weekly reinstall). Native app archived (`native-archive` branch; spec in `reference/native/`). **W0 done** on branch `web`: SQLite in a worker on the phone's private file system, `v1-schema` migration with snapshot-before-migrate, offline support with "Update ready", design tokens in dark and light, five tabs, Settings → Appearance. 9 tests; `make verify` passes. Checked in Safari on the iPhone 15 Pro Max simulator (iOS 27.0): the database opens and persists.
  - Next: W1 tasks on the board; hosting needs the owner.
- 2026-10-30: **W1 and W2 done, W3 core done.** Strong import (matches the export exactly), History, backup and restore, exercise library with search, Exercises tab, Strong matching, logging core; 345 tests. **Live** at https://bader-almutlaq.github.io/JEM/: checked in Safari on the iPhone 15 Pro Max simulator (database, Update ready, backup share sheet). Next: the Workout tab (T-024, in progress).
- 2026-10-30: **Workout tab live** (T-024): start, add exercises with last time pre-filled, number pad with kg/lb, typo prompt, finish summary. Checked end to end in Safari on the iPhone 15 Pro Max simulator against the live site. 406 tests. The app now covers what Strong did, minus templates (W4) and analytics (W5–W6). Next: backup reminder, search tie-breaks, rest timer, then templates.
- 2026-10-30: Rest timer (T-027), backup reminder (T-025) and search tie-breaks (T-026) live; migration `v2-exercise-rest-target`. 427 tests. Next: W4 templates.
- 2026-10-30: **W4 core done:** templates in folders (create, edit with your own rep ranges and RPE, supersets, start, save a workout as a template) and a History calendar. Migration `v3-templates`. 471 tests. Follow-ups in T-031. Next: analytics (W5–W6).
- 2026-10-30: **W5 core and the first W6 screens live:** e1RM and trend, hard sets per muscle, recent vs baseline (T-032, T-033); Analytics tab with the 7-day vs 28-day hard-sets chart (all training or one muscle) and weekly sets per muscle; Estimated 1RM card on each exercise (T-034 to T-036). 649 tests. Next: intensity × volume (rep-range mix, RIR histogram, intensity–volume map).
- 2026-10-31: **Owner's wave 1–3 live** (app renamed **JEM**): data-safety and accuracy audits (15 fixes), import review with one-tap "leave out all flagged", backup button on every finish, automatic Dropbox backup (bring-your-own key), body measurements (Analytics → Body; flexed/relaxed; how-to notes; dated change), finish comparison + personal bests, auto warm-ups on loadable weights, plain-language search, 852-exercise library with instructions and pictures (free-exercise-db), smaller muscles, Strong-format export (Hevy-compatible), import from Hevy/FitNotes/Fitbod. 968 tests. Waiting for the owner: PROPOSALS 7–13 and Strong screenshots.
- 2026-10-31 (afternoon): **Owner's page-by-page direction built** (`docs/design/PAGES-2026-10-31.md`), T-051 to T-062, all live: app chosen before import; Dropbox connects by redirect with clear status; warm-ups only on request; Measure tab with long-range charts; Strong-style live workout; exercise page tabs; plan pages and workout sheets; opt-in progression; illustrated drawings (215 exercises); deload. Machine manufacturers per exercise with a per-machine chart filter followed (T-063). Analytics tab redesigned (T-064, T-065): Overview, Muscles and Intensity views with a shared period. Next: the owner's full review. Codex: use Terra by default.
- 2026-11-01: **Analytics redesigned with the owner** (`docs/ANALYTICS.md`, T-076 to T-081, all live): each lift learns its own strength curve from its history; the owner's RPE chart on every exercise's Records tab (% guide and kg for that lift); exercise Progress with e1RM now, best e1RM, top set and one-measure charts, split by workout; workout and plan Analytics tabs (exercise progress rows, sets and effort per session or week, sets per muscle done vs planned); the Analytics tab is one page with pinned lifts, overview (typical length, average effort), strength ranking, a muscles table with muscle pages, and effort, reps and % of 1RM. Also: strong-style live workout and deload settings (T-074, T-075), Donkey Calf Raise in plain kg and tap-a-muscle contributions (T-076). Removed: time and volume per week, the 7-day vs 28-day chart, text lists, balance ratios, the bubble chart. 1,319 tests. Not yet tried on the owner's iPhone with real data.
