# Plan: Simplify follow-ups

- **Status:** in progress
- **Created:** 2026-11-02
- **Last update:** 2026-11-02
- **Branch:** none yet. The first pass merged as PR #1; start each next step on a new branch from `main` and write its name here.
- **Related:** the cleanup review of the branch diff against `main`

## Goal

Finish the review findings that were not applied in the first cleanup pass. The first pass removed dead code and unused styles and reused the Dropbox status caption. What remains either changes behaviour, touches the worker API, or needs a design choice, so each step below says what changes and why it is a problem today.

## Done when

- [ ] Every step is done, or deliberately dropped with a note.
- [ ] `make verify` passes.
- [ ] Behaviour-changing steps were checked in the app (or on a device where noted).

## Context

- Read first: `AGENTS.md` → *Look before you build*, `docs/ARCHITECTURE.md` (layers), `docs/DECISIONS.md`.
- The findings come from four read-only reviews (reuse, simplification, efficiency, altitude). They are claims to **re-check against the code before acting**, not facts.
- Each step: **Problem** (why it matters), **Behaviour** (what the owner or data could notice), **Do** (the change).

## Steps

### A. Cheap and safe (do first)

- [ ] **A1. Stop querying "database empty" during a workout.** *Problem:* `WorkoutScreen` runs `useDatabaseQuery('database-empty')` all the time, so every logged set (each bumps the data version) queues another worker call, and the result is only used when no workout is live. *Behaviour:* none visible. *Do:* ask only in the no-live-workout branch (for example inside the restore card), or cache it with `db.cache`.
- [ ] **A2. Check emptiness once on connect.** *Problem:* `completeConnection()` calls `isDatabaseEmpty()` and then `upload()` calls it again, and it is checked before every backup. *Behaviour:* none. *Do:* check once per operation and pass the result down.
- [ ] **A3. Format restore-list text once.** *Problem:* `DropboxRestoreSheet` builds new `Intl` formatters for up to 30 rows on every render. *Behaviour:* none. *Do:* compute labels and size text with `useMemo` when the list arrives.
- [ ] **A4. Share the Dropbox permission list.** *Problem:* `pkce.ts` hard-codes the scope string and `DropboxAppKeyForm.tsx` has the same list in another order, so they can drift. *Behaviour:* none if the scope string stays identical. *Do:* export one constant and `.join(' ')` it.
- [ ] **A5. Small tidy-ups.** `HistoryCard` passes `state` through a conditional spread (`Link` accepts `state={undefined}`); `HistoryScreen` repeats `monthLabel(...)` in `aria-label` and the heading (use `aria-labelledby`); `workoutMinimized.ts` has two one-line wrappers over one setter; define `--screen-bottom-extra: 0px` once in `:root` instead of two fallbacks; `SavedWorkoutSummary` re-implements warm-up pluralisation that `setCountsText` owns. *Behaviour:* none.

### B. Worker or data-path changes (verify results are identical)

- [ ] **B1. Filter inside the window query in `WorkoutExerciseBests`.** *Problem:* the `ROW_NUMBER()` and `COUNT() OVER` run over every non-warm-up set in the database; the `workoutIds` and `isInProgress` filters are only applied afterwards, so the saved-workout summary and plan history each scan the whole history. *Behaviour:* none if the output is unchanged; a wrong filter would change which sets count as best. *Do:* move the joins and filters into the CTE and add a test that compares old and new output on a seeded history.
- [ ] **B2. Give the tab bar a light active-workout query.** *Problem:* `AppChrome` now calls the full `liveWorkout()` snapshot on every screen, and re-renders (and re-runs two effects) after every logged set; before, only the Workout tab paid this. *Behaviour:* none visible; adds a worker method. *Do:* add `activeWorkoutSummary` (id, name, start time or null) for the chrome; keep the full snapshot for `WorkoutScreen`.
- [ ] **B3. Transfer restore bytes instead of copying.** *Problem:* the file-restore and Dropbox-restore paths pass a `Uint8Array` through Comlink, copying the whole SQLite file on the main thread (up to 150 MB). The old `BackupSection` transferred it. *Behaviour:* **the caller's buffer becomes unusable after the call.** If any path retries ("Try again", a failed validation) with the same bytes, it would break. *Do:* confirm no path reuses the bytes, then use `Comlink.transfer`.
- [ ] **B4. Load less for History.** *Problem:* `historyExerciseBests()` returns every exercise of every finished workout, though each card shows five rows; the three history awaits also run one after another. *Behaviour:* none visible; changes the worker payload. *Do:* return the first five plus a count per workout, and combine the reads into one worker call.
- [ ] **B5. `SavedWorkoutSummary` and `TemplateSessionHistory` waterfalls.** *Problem:* the summary fetches the full workout detail for one field (`templateId`) behind four sequential reads; the template history runs a second query even when there are no sessions. *Behaviour:* none. *Do:* fetch only what is shown, in one call, and skip empty queries.

### C. Behaviour changes that need a decision or a device check

- [x] **C1. `window.confirm` in `DropboxAppKeyForm` → `ConfirmDialog`.** Done: Reset now asks with `ConfirmDialog` ("Reset" / "Cancel"). *Problem:* it is the only native dialog in the app; iOS Home Screen apps show it out of style and it cannot name its buttons. *Behaviour:* **yes, the reset confirmation looks and flows differently.** *Do:* use `ConfirmDialog` with "Reset" and "Cancel".
- [ ] **C2. Strong measurements should read numbers like every other importer.** *Problem:* `StrongMeasurementsFile` does `parseDecimal(value.replaceAll(',', '.'))`, so `1,234` silently becomes `1.234`, while `readExportNumber` refuses it as ambiguous. Two policies in one import area. *Behaviour:* **yes: values that were silently accepted may now be flagged.** Real data matters here. *Do:* switch to `readExportNumber`, run `make import-report` on the owner's export and compare totals before and after.
- [ ] **C3. Replace `SummaryCard` with the shared `Section`.** *Problem:* `SummaryCard`/`SummaryRow` copy the caption, card and row styles of `Section`/`SectionRow`. *Behaviour:* **yes: spacing and typography on the finish summary may shift.** *Do:* extend `SectionRow` with the two extra lines and use `Section`; compare screenshots in dark and light.
- [ ] **C4. One pointer-drag helper.** *Problem:* `useSwipeDown`, `useExerciseReorder` and `WorkoutDrag` each hand-roll window pointer listeners, cleanup and `pointerId` filtering, so an iOS fix must be made three times. *Behaviour:* **risk on iOS touch handling** that can only be checked on a device. *Do:* extract a helper in `design/gestures/` (an `AbortController` removes the listener bookkeeping) and move the three callers one at a time, testing each on the phone.
- [ ] **C5. Template draft hand-off.** *Problem:* leaving the template editor to pick an exercise keeps the draft in a module-level variable plus a `?restore=1` URL flag; a reload or a second "new" editor can lose or mix drafts. *Behaviour:* **yes: where the draft is kept changes (router history state).** *Do:* store the draft in the history entry and delete the singleton, the flag and the cleanup effect.

### D. Structural changes (larger; do one at a time with tests)

- [ ] **D1. One warm-up policy.** *Problem:* "template warm-ups are protected, so don't generate more" is written in three places in `WorkoutLogger` and re-derived in `WorkoutPreview`; they agree only by habit. *Behaviour:* **could change warm-ups if the copies currently disagree.** *Do:* one pure function beside `automaticWarmupCount`, called by both; test preview and live logger on the same inputs.
- [ ] **D2. Dropbox code.** *Problem:* `DropboxBackup.run` takes two positional booleans; `invalid_client` is detected in two shapes; `responseError` sniffs the URL; worker errors are re-wrapped at one call site while `run` has a branch that can never match. *Behaviour:* none intended. *Do:* an options object for `run`, one failure classifier used by the token and API paths, an operation tag instead of URL sniffing, and normalise worker errors once.
- [ ] **D3. Empty-phone guard in core.** *Problem:* "never upload an empty phone" is enforced by the app layer, so any other caller is unguarded, and "empty" is a hand-listed set of tables that a new table silently escapes. *Behaviour:* none for the owner; changes where a refusal comes from. *Do:* enforce it where the cloud snapshot is produced, with the table list derived from one registry shared with backup and restore.
- [ ] **D4. Minimized-workout state.** *Problem:* a bare boolean needs an effect to reset it, and `AppChrome` and `WorkoutScreen` each decide "is the workout screen showing". *Behaviour:* none intended. *Do:* store the minimized workout's id and expose one presentation hook (`active`, `minimized`, `none`, `fresh phone`) used by both.
- [ ] **D5. Fold `RestoreWorkoutScreen` into `StartWorkout`** (about 25 duplicated lines), mount the Dropbox restore sheet once in `AppChrome`, and drop the `showAction` prop. *Behaviour:* none intended.
- [ ] **D6. Fold `DropboxAppKeyForm`'s five props into `useDropboxBackup()`**; the two callers disagree on `canReset`. *Behaviour:* **the Reset button could appear in a state where it was hidden (or the reverse).** Decide which rule is right first.
- [ ] **D7. Move `templateStats` into `src/core`** with tests and a `Heuristic:` note (it averages target RPE and counts a range as its midpoint), and add a concept-ownership row. *Behaviour:* none.
- [ ] **D8. Retired Dropbox keys.** *Problem:* `readAppKey` deletes from storage as a side effect of a getter, and the retired-key list needs a hand edit whenever the built-in app changes. *Do:* run the cleanup once at startup, or remember which built-in key a saved key was chosen against.

## Next step

Start with A1 (smallest, safest), then A2 to A5, and run `make verify` after each group.

## Notes

- Skipped on purpose in the first pass: anything above. The review rule was to skip findings that change behaviour or reach well outside the diff.
- `ExerciseBestsTable` keeps `key={index}`: the same exercise can appear twice in a workout, so `exerciseId` is not a unique key.
- Not worth doing: the `--workout-rpe-box` token is unset but has a 34 px fallback, so it is harmless.
