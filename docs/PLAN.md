# JEM: plan and status

An offline iPhone workout tracker (a web app on the Home Screen) built to replace Strong. It keeps four years of Strong history, has a large exercise library, makes building workouts easy, and gives science-based analytics. Research behind every decision: `reports/Workout tracker app research.md` (details in `research_notes/`).

This file holds what is true now: principles, platform, what exists and what does not. History lives in git, and the reasons behind choices live in `docs/DECISIONS.md`. Keep this file short; delete anything that stops being true rather than appending to it.

## Principles

- **Measure, don't prescribe.** The app records and calculates. Training decisions stay with the user. Progression rules are opt-in, per exercise, defined by the user.
- **Literature, not hype.** Every metric traces to a cited source in the report, or is labelled as a descriptive heuristic.
- **Excluded:** AI features, exercise videos/animations, social, streaks, celebrations, accounts.
- **Not cluttered.** Logging needs 2–3 taps per set, with last session's numbers always visible inline.
- **Data is irreplaceable.** Never lose a set. Backups are one tap to a file, or automatic to the owner's own Dropbox, with the last-backup date always visible (`docs/DATA.md`). Keep the original Strong CSV forever.
- Engineering standards: `AGENTS.md`. Agent workflow: `docs/agents/WORKFLOW.md`. Open tasks: `docs/tasks/BOARD.md`. Structure: `docs/ARCHITECTURE.md`. Visual system: `docs/DESIGN.md`.

## Platform

- An offline web app on the iPhone Home Screen (open the site in Safari → Share → Add to Home Screen). It runs full-screen, works with no connection and never expires.
- All data stays on the phone, in the Home Screen app's private storage. **Deleting the Home Screen icon deletes the data**, so backups matter.
- Hosted on GitHub Pages at https://bader-almutlaq.github.io/JEM/ (code only, never data). Publish with `make deploy`.
- Updates download in the background and wait for a tap ("Update ready"), so the app never reloads mid-workout.
- Layers: WorkoutCore (`src/core`, pure TypeScript), a database worker (`src/worker`, SQLite as WebAssembly) and React screens (`src/app`). Weights are stored in kg exactly as entered, with the unit typed. The schema is the migrations in `src/core/db/migrations.ts`.

## What exists (2026-11-02)

- **Logging:** live workout with previous values inline, number pad (kg/lb, RPE), automatic warm-ups, rest timer, supersets, typo check, finish summary with comparison and personal bests, minimize and resume.
- **Plans:** folders, workouts, targets per set, opt-in progression suggestions, deload stages, start from a template or a past session, plan and workout analytics.
- **History:** list, calendar, workout detail, editing past workouts.
- **Library:** about 850 exercises with muscles, aliases, instructions, optional pictures, machine manufacturers, custom exercises, slang- and typo-tolerant search.
- **Analytics:** personal strength curves, e1RM and trend, hard and fractional sets per muscle, effort and rep distributions, strength index, pinned lifts, long-range charts with table views.
- **Body:** measurements with flexed/relaxed sites, guides and change over time.
- **Import and export:** Strong, FitNotes, Fitbod and Hevy import with a review step; Strong-format and measurement CSV export.
- **Backup:** share-sheet file, automatic Dropbox backup, restore from a file or Dropbox with a safety snapshot, empty-phone guard.

The latest changes (live workout rework, Dropbox paste-code connection, tab bar hiding) have not been tried on the owner's iPhone with real data and a finger yet.

## Not built yet

Ideas, not commitments. Check the code before assuming one is missing, and design with the owner before writing a task.

- Top set with back-off sets at a percentage of it (a separate feature from progression).
- Exercise quality profile (stretch and tension) if accurate data exists.
- Attachment and grip variants beside machine manufacturer (open question: variant tag or separate exercise).
- Photo attachment on exercise notes.
- Stall flag with a user threshold, RIR calibration from failure sets, lengthened-bias share chart.
- Strength relative to bodyweight, and a bodyweight overlay on e1RM.
- Weekly report and block comparison.
- Cold analytics under 400 ms for the longest periods (about 660 ms now; see `docs/DECISIONS.md`, T-093).

## Limits of the web platform

No vibration, no reliable rest-timer alerts while the screen is locked, and no silent write to iCloud Drive. Automatic backup therefore uses Dropbox.

## Needed from the owner

- Strong screenshots as a UI reference (optional).
- Trying the latest build on the phone and sending feedback per page.
