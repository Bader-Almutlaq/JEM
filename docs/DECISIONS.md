# Decisions

Why things are the way they are. Check here before changing or redoing a feature: the reason it was built this way may still apply.

**Keeping this file useful**
- Add an entry when you make a choice a later agent could reasonably question: date, title (with task ID if any), the decision, why, and alternatives rejected. Newest last.
- When a decision is reversed or replaced, **edit or delete the old entry in the same change**. Don't leave both; a stale entry misleads. Git history keeps what was removed.
- If an entry is only partly replaced, say so on its first line: `*Partly superseded by <entry>: <what no longer holds>.*`
- Write what is true now, not a diary. Progress belongs in git and `.claude-plans/`.

## 2026-10-29: Weights stored in kg as entered, plus the entry unit
- **Why:** Strong exports kg; the owner enters some lifts in lb. Storing the entry unit lets the UI show "135 lb" rather than "61.23 kg" without rounding stored data.

## 2026-10-29: Log in each exercise's unit; analyse in kg
- **Why:** the owner's gym mixes kg and lb equipment and they want to type what they see. Analytics need one scale. Both units are shown on demand.
- **Alternatives:** a global unit (forces mental conversion); per-chart unit choice (inconsistent totals).

## 2026-10-29: Effort is stored once, as RPE
- **Why:** Strong exports RPE, and RIR = 10 − RPE exactly (Zourdos 2016). Storing one column means the two can never disagree. The logging screen can still accept RIR and convert it.

## 2026-10-29: Backup files are single-file rollback-journal databases
- **Why:** a copy of the live WAL-mode database needs `-wal`/`-shm` side files to open, which breaks read-only validation and can sync out of step in iCloud. Each snapshot is switched to `journal_mode = DELETE` and only the main file is moved into place. Found by the restore test.

## 2026-10-29: Strong exercise names import as-is; library matching moves to M2
- **Why:** the library (M2) doesn't exist yet, and blocking the import on it would delay seeing four years of data. Each Strong name becomes an exercise (source `strong`) whose default entry unit is Strong's current unit for it. M2 adds a "match to library exercise" step that re-points history to library entries, and the owner's choices are saved.
- **Alternatives:** fuzzy-matching against a library during import (needs M2 first).

## 2026-10-29: Typos are reviewed, not auto-corrected
- **Why:** a flagged set may be real (a different machine, a light day). The importer suggests a correction (decimal shift or kg↔lb) but changes nothing unless the owner accepts. Findings are grouped by session so a whole odd session takes one tap.

## 2026-10-29: The app measures; it does not prescribe
- **Why:** the owner chooses training approaches from the literature. Progression rules are opt-in and user-defined; analytics are descriptive.

## 2026-10-30: In-memory search instead of SQLite FTS5
- **Why:** about 600 exercises fit in memory trivially. Typo tolerance, slang expansion and usage ranking are easier to get right, and to test, in code than with FTS5 plus trigram tables. One implementation (`ExerciseSearch`) serves both the search box and the import-name suggestions.

## 2026-10-30: Library exercises are read-only; the seeder owns their fields
- **Why:** the seeder rewrites names, muscles and tags whenever `library.json` changes version, so owner edits would be lost. The owner duplicates a built-in exercise to customise it. Owner-owned fields (default entry unit, archived) are never touched by the seeder.

## 2026-10-30: Merging an exercise keeps its old name as an alias
- **Why:** after the owner matches "Bayesian Cable Curl" to "Bayesian Curl (Cable)", re-importing a Strong export must land on the same exercise, and search should still find the old name. The `exerciseAlias` table stores it; `ExerciseNameResolver` checks names then aliases.

## 2026-10-30: Muscle rows are written inside the schema migration, frozen
- **Why:** a migration must give the same result forever. Reading the `Muscle` list from a migration would make old migrations change when the enum grows. A test checks that the rows and the enum agree; a new muscle needs a new migration.

## 2026-10-30: Agent rules live in AGENTS.md; work is handed out through a task board
- **Why:** the owner doesn't read code and uses several agents and providers across many chats. `AGENTS.md` is read by Codex and other tools, and `CLAUDE.md` is a symlink to it so the two can never differ. `docs/tasks/` holds one self-contained brief per open task, and `docs/agents/WORKFLOW.md` defines claiming, parallel work, review and handoff, so no chat's context is needed to continue.

## 2026-10-30: Planned sets are real rows, pre-filled from last session
- **Why:** logging must take 2–3 taps per set. Adding an exercise copies last session's sets (kind, weight, reps, RPE) as planned rows in the exercise's entry unit, so a set done the same as last time is one tap (complete). Explicit `isInProgress` and `isCompleted` columns (migration v3) keep "planned" separate from "done" without inferring it from timestamps. Imported Strong sets have no completion time but are done. Finishing removes what was never completed.
- **Alternatives:** empty rows with greyed placeholders, as in Strong (an extra tap per set to copy); deriving state from `completedAt`/`endedAt` (ambiguous for imports).

## 2026-10-30: An offline web app on the Home Screen, not a native app
- **Why:** free native signing expires every 7 days, and the owner won't reinstall weekly or risk the app not opening at the gym. A web app added to the Home Screen never expires, needs no Mac and no fee, and runs fully offline once installed. All data stays on the phone.
- **Kept:** the product, the schema, every formula, the curated library (`src/core/library/library.json`), the design system and the test cases. The native Swift app was the spec for the port; it is deleted from `main` and complete on the `native-archive` branch.
- **Given up:** vibration (Safari has no vibration API), reliable rest-timer alerts while the screen is locked, and fully automatic cloud backups (a web app can't write to iCloud Drive by itself; backups take one tap; see `docs/DATA.md`).
- **Alternatives:** Mac auto-refreshing the native app over Wi-Fi (fails silently if the Mac sleeps or the phone is away); SideStore/AltStore (broken by Apple sign-in changes since 2026-10-12); paying $99/yr (ruled out by the owner).

## 2026-10-30: Web stack: TypeScript, React, Vite, SQLite in WebAssembly
- **Why:** TypeScript and React are the most widely known stack, so any agent or provider can work on the code. SQLite (the official WebAssembly build) keeps the native schema, migrations and analytics SQL almost unchanged, and a backup is still one `.sqlite` file. It stores data in the browser's private file system through SQLite's "SAH pool" storage, which needs no special server headers and works in Safari since iOS 16.4.
- **Shape:** the database runs in a Web Worker so queries never block the screen; the screen calls it through one typed API (`src/worker/WorkerApi.ts`, via Comlink). WorkoutCore (`src/core`) is synchronous, pure TypeScript with no DOM types, tested in Node with Vitest.
- **Alternatives:** IndexedDB with Dexie (no SQL for analytics; the schema would be redesigned); Svelte (smaller, but fewer agents know it well); a server database (data would leave the phone, and it needs hosting that costs money).

## 2026-10-30: One web migration replaces the native app's three
- **Why:** migrations are append-only once they ship, but no native build ever reached the phone, so no data exists in the old schema. Folding v1–v3 into `v1-schema` gives a clean start. From now on the web migrations are append-only.

## 2026-10-30: Updates wait for a tap
- **Why:** the app is stored offline by a service worker. A new version downloads in the background, then shows "Update ready" and waits, so it can never reload in the middle of a workout. If a download fails, the installed version keeps working.

## 2026-10-30: Appearance preference lives in localStorage
- **Why:** it's a display preference, not training data, so it stays out of the database and the backups.

## 2026-10-30: Rest timer counts up from the last completed set; the target is the owner's
- **Why:** measure, don't prescribe. The bar shows time since the last completed set (derived from `completedAt`, so it survives closing the app) against a target the owner sets per exercise with ±15 s (`exercise.restTargetSeconds`, migration v2). The 2:00 starting value is a convenience, not advice. Past the target it keeps counting with a quiet ✓, because the rest actually taken is what gets recorded.
- **Limits:** no sound, vibration or lock-screen alert; the web can't deliver them reliably on iOS.

## 2026-10-30: Opening storage never deletes it, and retries while another copy holds it
- **Why:** SQLite's SAH-pool storage deletes the whole pool when opening fails, unless `preserveOnInitFailure` is set. Opening fails whenever another copy of the app holds the files (a second Safari tab, or the old copy still closing after "Update"), so the default could wipe the owner's data. `OnDeviceStore` sets `preserveOnInitFailure`, retries with `forceReinitIfPreviouslyFailed` (8 × 750 ms), and then shows a message saying the data is safe and what to close. Found while testing two Safari tabs on the simulator.

## 2026-10-31: Automatic backups go to the owner's Dropbox
- **Why:** the owner wants backups without remembering to tap. A web app can't write to iCloud Drive in the background, so it needs a cloud the owner signs into once.
  - Dropbox gives browser-only apps a long-lived refresh token (OAuth PKCE, no secret), so uploads stay silent forever.
  - Google's browser sign-in lasts about an hour and needs a tap to renew. The owner first picked Google Drive, then switched to Dropbox for this reason.
- **How:**
  - A Dropbox app with **App folder** access: the app sees only `/Apps/<app name>/`, never the rest of the owner's Dropbox.
  - Connecting is one-time, with PKCE and no redirect. The owner approves on dropbox.com, copies the code Dropbox shows, and pastes it into the app. This avoids iOS Home Screen redirect quirks.
  - The refresh token lives in this phone's `localStorage`, outside the database, so it never ends up inside a backup file.
  - Upload after every finished workout and retry pending uploads when the app opens or comes back online.
  - The app key is public and lives in the code. There is no secret and no server.
- **Retention:** the app prunes only its own backup files in its app folder. It keeps the newest 14 and the first backup of each calendar month, and never touches local snapshots.
- **Limits:**
  - Disconnecting or clearing website data removes the token, so the owner must connect again.
  - The manual "Back up now" (share sheet) stays as a fallback.

## 2026-10-31: Body measurements model
- **Model:** relaxed and flexed are independent observations of one site, unique per timestamp/site/state. Biceps, forearms, thighs and calves support both; other seeded sites are relaxed only. Unknown slugs are preserved as custom length sites. Custom sites explicitly choose whether they support flexed entries.
- **Preservation:** v4 rebuilds measurements transactionally after the worker's existing snapshot. Old rows retain every field and become relaxed. A nullable entry-unit column retains units typed into new entries without inventing original units for imports.
- **Display:** Body owns length and weight display pickers in app settings. No global weight setting existed before this task; exercise entry units and kg training analytics retain their existing meaning.
- **Changes:** lookbacks anchor to each state's latest measurement, so old history remains readable. Monthly rate is a least-squares descriptive heuristic over 12 elapsed weeks, scaled to a mean Gregorian month. Missing baselines stay absent, rather than interpolated.
- **Charts:** reuse the shared frame, scales, trend/comparison lines, dots, touch rule and table with their default styling. The two-state legend identifies the existing thick accent relaxed series and thin ink flexed series.


## 2026-10-31: Shared loading ladders and generated warm-ups (T-044)

All suggested loading is owned by `LoadableWeight.ts`: exact kg ladders with a minimum and increment, nearest ties downward, and downward warm-up rounding. No rounding is imposed on manually logged working weights. Standard lb barbells use 45 + 5n lb; other bars keep their specified kg empty weight with lb plate increments because no different lb empty weight was specified. Kettlebells use 4 kg or 5 lb steps. Unsupported equipment returns input loads unchanged even if an override is present.

`WarmupPlan.ts` owns the count schemes, classification defaults and slot reconciliation. Heuristic: Ribeiro 2021, Motricidade's systematic review supports specific warm-ups near working load (40–80% studied); these exact rep/fraction schemes, including the four-set 85% final step, are the owner's chosen heuristic. Default counts per exercise kind: see T-098. Inherited planned warm-ups are replaced by the current plan, including count zero; this avoids stacking generated warm-ups on old prefill.

Completed and manually edited warm-ups occupy their original plan slots and are never overwritten. Manual edits to weight or reps stay protected even if later changed back. Existing ids are reused for refreshed slots; obsolete untouched rows are removed. Deleting every warm-up suppresses regeneration for that workout entry. Provenance lives in a persistent logger per worker database connection; a restored connection gets a fresh logger. On reload, preserve existing warm-ups and absent warm-ups on already-loaded entries conservatively, since edit provenance cannot be recovered from the schema.

Loading overrides are editable on built-in exercises separately from their frozen metadata. A warm-up tint token has both light and dark values, and extra space marks the transition to work; generated weight/reps stay quiet until edited or completed. No analytics formulas change.


The brief's 60 kg, three-warm-up example says 20 × 8 for the first set, but 40% × 60 = 24 kg rounds down to 22.5 kg on the specified 20 + 2.5n ladder. The implementation follows the explicit fractions and rounding rule (22.5 × 8, 35 × 5, 47.5 × 2); an empty-bar exception needs an owner decision rather than an invented threshold.

## 2026-10-31: Expand the curated library with reviewed public-domain details (T-047)

The owner requested a broader
catalog, instructions and optional pictures. The converter consumes only the committed pinned
source and reviewed mapping; its frozen base preserves all 420 original names/keys and primary
muscle tags. New source entries retain meaningful movement/grip/range differences, and matching
variants receive source aliases and details. New small-muscle tags are secondary on synergists,
so original primary-muscle volume stays unchanged. Direct serratus punches and tibialis raises
are the exceptions. A custom exercise whose name collides with a newly added library entry stays
custom and untouched; the seeder omits that library row rather than taking ownership of it.

Pictures load only on the exercise detail screen, from the exact upstream commit recorded in
`data/sources/free-exercise-db/SOURCE.md`, through `cdn.jsdelivr.net`. This optional picture read
is the only network read besides app updates and the owner's connected Dropbox. It sends no
workouts, measurements, exercise history or other owner data; requests contain only public source
image paths, with no referrer or credentials. As with any network host, the CDN sees ordinary
connection metadata such as the requesting IP address. The default-on phone-local setting can
stop all picture loads. Instructions stay bundled. Workbox CacheFirst caches only this pinned
host/path with a 600-frame limit; uncached/failed frames render nothing. There is no background
image prefetch or wholesale picture download. Credits live under Settings using a query parameter,
so this task does not modify the shared app route table.


## 2026-10-31: Cable add-on plates (T-053)

Cable ladders assume 1.25 kg (2.5 lb) add-on steps from 2.5 kg (5 lb); machine defaults remain 5 kg (10 lb). Per-exercise step overrides remain available.

## 2026-10-31: Keep a pending Dropbox verifier briefly across Home Screen restarts (T-052)

- **Why:** iOS can restart the Home Screen app while the owner switches to Safari to approve Dropbox. An in-memory-only verifier loses the first step and makes the pasted code unusable.
- **Lifetime:** store the PKCE verifier, creation time and public app key in phone-local `localStorage`, beside the refresh token and outside SQLite/backups. Heuristic: expire after 10 minutes to allow the Safari round trip without retaining unfinished grants indefinitely. Remove it before a nonblank code exchange, on disconnect, or on a key change; discard malformed, expired, future-dated or different-key entries when checked. A failed exchange requires opening Dropbox for a fresh code; the pasted text stays visible for context.
- **Security:** the verifier alone cannot obtain a token: Dropbox also requires the corresponding authorization code, which works once. Codes are never persisted, access tokens remain in memory, and credentials are never logged. The existing App folder grant limits access to the app's own Dropbox folder.
- **Feedback:** Settings and the finish summary share status wording. Connection success is confirmed only after the first backup completes. Saving the advanced app-key override always answers inline; saving the same effective key preserves any pending connection.

## 2026-10-31: Measure owns body-part history; Settings moves to main-tab headers (T-055)

- Tabs are Workout, History, Exercises, Measure and Analytics. Settings is a gear on each main tab's root header; pushed pages keep their back navigation.
- Analytics remains the training overview hub. Its Training content, queries and formulas are unchanged; entity-specific measurements belong to Measure.
- Never-recorded parts stay in Add body part until a measurement is saved. No new visibility state is stored. Custom creation opens the new part's page for its first log; left/right pairs stay together. Bodyweight remains in storage and backups but is excluded from Measure navigation and logging choices.
- Long-range bucketing is a descriptive display heuristic: daily through 92 days, ISO weekly through 730 days, monthly beyond. Full screen is one level finer. Windows anchor to the latest data rather than the current date, preserving usefulness for older imported history. Measurements use the mean, independently per side and state; no existing change formula is altered.
- Migration v7 replaces only ab guides equal to the frozen v4 defaults (and only on built-in rows). Edited or cleared guides stay verbatim. The existing worker migration snapshot applies; no measurement row is rewritten. The schema has no edit-history marker, so an owner note identical to the old default is indistinguishable from an untouched default.


## 2026-10-31: Plans, workouts and sessions are display names (T-058)

- **Words:** Plan means `templateFolder`, Workout means `template`, Session means a finished `workout` row in History. Keep schema, backups, ids and internal names unchanged; this needs no migration.
- **Membership:** Plan history follows workouts currently assigned to it. Moving a workout moves its scoped history; deleting a saved workout removes its template link, while its sessions remain in History. Deleting a plan keeps its workouts under Other workouts. No historic membership is invented.
- **Totals:** Count every completed non-warm-up set, including drop/failure and low-effort work. Hard sets are a distinct measure and would undercount this requested working-set total. Reuse the existing e1RM qualification rules. Unknown, invalid or reversed duration is absent from duration means; a genuine zero remains zero.
- **Top exercise:** Interpret this as the first exercise in the saved workout order, named on the chart. Take its best qualifying e1RM across all repeated entries in each session, retaining separate same-day sessions. An unsupported exercise produces no estimate; do not silently substitute a different lift.
- **Charts:** Add sum aggregation and an optional overview period to the shared long-range chart for weekly session counts. Other callers retain their defaults. Expanded charts retain range clipping and finer automatic periods; the caption identifies the actual period. Sum charts omit observation spread bands because their min/max is not a spread of totals.


## 2026-10-31: Optional illustrated exercise pictures

Prefer unmodified everkinetic illustrations where a reviewed movement and equipment match exists,
with free-exercise-db photos as the fallback. The pinned everkinetic path on jsDelivr is a second
optional picture host: requests happen only when viewed, without credentials or referrer, and are
cached for offline use. The owner can choose photos only or turn pictures off.


## 2026-10-31: Per-workout double progression is an opt-in calculation (T-060)

*Partly superseded by T-090: suggestions are no longer an opt-in switch, and the one-rep-per-position rule is now the Reps first mode. The ladder, reload and amber/red value notes still hold.*

- Store only nullable `templateExercise.progression = 'double'`; keep per-set ranges and RPE in
  existing targets. Offer 8–12 for confirmation when enabling with incomplete working targets.
  Reject incomplete working ranges on save while enabled. Timed exercises get no progression control.
- Reuse `PreviousPerformance` for same-template preference with global fallback, and use that same
  history to seed grey values. Warm-ups are excluded from progression; working, drop and failure sets
  share the existing non-warm-up positional convention. Reordered exercises match by exercise id and
  occurrence because live entries have no persistent template-exercise id. Editing a template during
  a live session therefore changes its on-the-fly targets; deleting the template disables its suggestions.
- `ProgressionPlan` owns the calculation. Each position climbs one rep to its own upper bound; a load
  jump requires all historical/planned working positions to match and reach their bounds with effort
  at/below their own RPE targets (unknown effort or target permits progress). A below-range set rises
  to its minimum first; an in-range above-target set repeats. The report's double-progression section
  supports the model; the precise step and effort gate are the owner's descriptive heuristic.
- The load jump uses the existing equipment ladder in the live entry unit, including kg overrides.
  Bodyweight gets reps only and repeats at the top. Unrestricted equipment repeats at the top because
  no owner-defined load step exists. No load decrement is inferred.
- Amber stays separate and tappable even when equal to grey. It never writes until accepted; ticking
  uses the stored baseline. Completed or entered cells hide amber. On reload a changed value is
  treated as entered; an identical accepted value cannot be distinguished without persisting provenance,
  so it may show amber again. No new provenance or suggestion rows are stored.

## 2026-10-31: Deload is a stored exercise stage with optional suggestions (T-062)

- The owner's choice supersedes the earlier week/volume proposal: sets and reps stay unchanged;
  barbell compounds use −20% then −10%, others −10% then −5%, before returning to normal logging.
  This is a descriptive heuristic, differing from the research report §12.9's 40–50% fewer sets plus
  −10% load or +2–3 RIR. There is no fatigue trigger or automatic calendar-based deload.
- `DeloadPlan` owns the pure stage and suggestion rules. Warm-ups and deload share the exact
  `isBigBarbellCompound` classification. `LoadableWeight` owns rounding in the set's entry unit.
  The brief's 30 kg curl example conflicts with its round-down rule: 27 kg rounds down to **25 kg**
  on the default 2.5 kg ladder, while stage 2's 28.5 kg rounds down to **27.5 kg**. The rule wins.
- Each new live occurrence inherits stage 2 only from stage 1 in its latest finished predecessor,
  ordered by start time then id. Different workouts participate in the same exercise cycle;
  repeated occurrences are matched independently. A discarded session never advances the cycle.
- Stage 2 uses the original normal load, not the rounded reduced load from stage 1. A missing
  original position has no invented load. Reps come from the immediately preceding performed set.
  Ending deload or finishing stage 2 restores ordinary previous-value/progression behavior; neither
  writes a forced return load. The stage survives finishing and History edits in schema v9.
- Chart annotations are presentation only. Deload sessions still contribute to all metrics and PRs.
  Their performance buckets are hollow/shaded and labelled in tables; the PR step line is unmarked.


### Machine manufacturer storage (T-063)

- Store a nullable manufacturer on each workout and template exercise. The convenience list is
  non-exhaustive; custom names retain their spelling after whitespace normalization. Known names
  use the list spelling, ignoring case. A name is limited to 40 characters for phone readability.

## 2026-10-31: Muscle coverage and intensity interpretations (T-065)

Frequency counts a local day only when its muscle's fractional hard sets add to at least one. Selected-range weekly means divide by the number of Monday weeks touched; the numerator uses the selected inclusive dates. Neglected uses the 28 local days ending at the selected end date and divides by four. Days since training counts direct hard sets only. Pattern balance counts each hard set once, independent of muscle associations. Trunk, neck, carries and Olympic patterns are neither upper nor lower; upper/lower counts otherwise follow the limb moved. Ratios have no target and are absent when either side is zero.

Relative intensity uses the existing daily exercise strength trend, including a day's own qualifying estimates, without future observations. Weekly points include only hard weight-and-reps sets with a positive load and a trend. Effort buckets use logged RPE, including failure sets; unlogged effort stays separate. Fractional RIR is assigned to the lower integer bucket, with five and above grouped. Rep ranges exclude invalid or nonpositive reps. The smaller-muscle list follows the owner's explicit choice.


## 2026-10-31: Settings and History navigation

Full History opens from the Workout header, while session histories remain in their relevant pages. Settings is a gear on each main tab's header (see T-055).

## 2026-10-31: Confirm accidental workout finishes

Ask before discarding a workout with no completed sets. For a workout under five minutes ask whether to save; when the last completed set is over sixty minutes old offer to end at that set. Ask about remaining planned sets after these checks. These thresholds are owner-requested heuristics.

## 2026-10-31: A workout made from a session claims its unlinked namesakes

History imported from Strong has no templates, so a workout created from a past session (drag into a plan, Add to plan…, Save as workout) would start with an empty History and Analytics. `TemplateStore.createFromWorkout` therefore links every finished session with the same name (ignoring case and surrounding spaces) that belongs to no template, the source included. It only fills the empty `workout.templateId`; sessions already linked to another workout are left alone, and no logged values change.


## 2026-11-01: Set groups and explicit progression

*Partly superseded by T-090 and T-098: suggestions apply on tap, and warm-ups are generated automatically.*

Warm-ups are grouped before work when added or changed. Progression suggestions are applied only when the owner taps each inline suggested value; deload keeps its existing controls.

### Plan summaries as a week (2026-11-01)

A plan represents one week for planned set counts. Frequency counts each workout with at least one fractional set for a muscle, matching the muscle coverage threshold; this is a planning count rather than a prediction of completed training.


## 2026-11-01: Live workout layout and effort entry

Live exercises form a continuous list with separated rows. Progression suggestions use individual red values beside the existing cells, replacing the Progress button; accepting one does not complete a set. The pad exposes RPE directly with quick picks, and logged effort alone has a badge. Rep ranges edited during a linked session update the matching occurrence in the saved workout.


## 2026-11-01: Configurable deload reductions (T-075)

Refines T-062: the owner chooses weight, sets or both. The default set reduction is 50% (research report §12.9); working, drop and failure sets count, warm-ups do not. The owner chooses an absolute kept count for an exercise, and completed sets are protected. Stage 2 restores the pre-cycle working count for Both and reduces load by half the stage-1 percentage, rounded to half a percentage point; Sets returns directly to normal. Returning to load-only or ending a deload does not recreate removed sets. Nullable settings preserve older rows and original defaults.

The set-percent check includes zero because the required exact kept-count formula yields 0% when all sets are kept; NULL remains the 50% default.

## 2026-11-01: Donkey Calf Raise uses plain weight (T-076)

The library tracked the bare Donkey Calf Raise as bodyweight, but the owner uses a machine and requested plain kg. Its existing stored weights now mean machine weight; migration leaves the sets unchanged and preserves renamed and custom exercises.

## 2026-11-01: Personal strength curves and exercise Progress (T-077)

Personal k is now active, superseding its W8 “optional/on hold” placement. The RTS table remains a lift-independent guide; estimates and load predictions use the exercise's own curve. There is no stored fit or migration: one query reads finished, completed history through the requested date, and the same curve accompanies exercise metadata to every estimate caller. Saved-workout and machine filters change the displayed sessions, not the fitted exercise identity. A future decision can split machine variants into separate exercises.

The report leaves the loss function and two-week boundary unspecified. Heuristic: anchor non-overlapping 14-day windows to the earliest valid observation and minimise summed weighted relative variance within windows that contain at least two effective-rep counts. This avoids fitting strength differences between training periods and lets unlogged effort retain its existing half weight. Ten qualifying sets and two effective-rep counts are necessary; an identifiable window is also required. Search 8–50 in half steps, keep the smaller k on exact ties, and blend all qualifying-set count with fifteen prior sets. An unmapped compound has no invented prior: enough identifiable data gives the fitted k directly; otherwise estimates stay absent.

Progress preserves every finished session, including separate same-day sessions. Top set means the heaviest completed non-warm-up set, ties resolved by more reps then logged order. Any selected deload occurrence marks the session. Deloads remain in raw plots and lifetime bests, but are excluded from the headline trend, four-session changes and latest-session takeaways. The top-set tile still describes the actual last session, labelled Deload when applicable. “Four sessions ago” compares five non-deload observations; absent e1RM at an endpoint means no e1RM change.

The strength/bodyweight Progress plots use the shared chart axes, touch rule and size measurement with raw session points. Selection persists after release so the session link can be opened. Tables preserve each session and link to its recorded sets. Compare days adds up to two saved-workout lines with the first three categorical colors. Timed exercises retain their existing applicable charts. RPE load grids round in the exercise's entry-unit equipment ladder via LoadableWeight, including its minimum-load clamp; percentages are not equipment-rounded.


## 2026-11-01: Analytics dashboard (T-078)

*Partly superseded by T-087: Pinned, Overview, Muscles and Effort are separate views again. The pin, typical-length and percent-of-max notes still hold.*

The Analytics tab combines the agreed sections into one page. The signature, frequency and balance
panels, intensity-volume map and session-volume overview are removed. Typical session length is the
median within the existing duration limit. Percentage of maximum uses the greater of the dated trend
and the session's best estimate, with the set load as a lower bound to keep the percentage at most 100.
Pins are ordered locally and included in backups; the selected period controls their change figures.


## 2026-11-02: Known-effort curve fitting, lower traps and recent plan windows (T-082)

Refines the 2026-11-01 personal-curve decision: only otherwise qualifying sets with logged RPE or kind `failure` enter the fit, its count, effective-rep diversity and anchored 14-day windows. Assumed RIR 2 remains useful for estimating unlogged sets but is not evidence of a maximum. Heuristic: within each window retain only the best trial e1RM at each effective-rep count, because top sets approximate a max and repeated back-offs should not outvote them. The ten-set threshold, 8–50 search, half-step grid, tie rule and fifteen-set prior blend stay unchanged; n counts all qualifying known-effort sets before per-window selection.

The lead then checked the fit on the owner's real history: they log RPE on most sets, yet RPE 7 sets pulled the squat's k to 16.4 and its estimate about 25 kg above their top sets. So fitting is narrowed to failure or RPE ≥ 8 (RIR ≤ 2), where the report says self-rated RIR is most accurate (Halperin 2022). On the owner's export: squat k 31 (e1RM about 148 kg, matching their own sense of ~150), bench 28.5, deadlift 28. RPE ≥ 8.5 left too few sets and k swung to the 48–50 bound.

Lower traps receive a secondary tag on Face Pull, every present Y-Raise and the specified Reverse Fly families (ten variants; no prone trap-raise family is present). Rows and pulldowns keep `upper-back`. Frozen migration v15 adds only missing library-owned rows, preserving custom definitions and existing roles. The bundled library and reviewed source mapping agree without incrementing the seeder version: existing data needs only the targeted addition.

Recent plan/workout averages cover at most four local Monday weeks ending with the latest finished session’s week, including it; the first session limits the denominator when history is shorter. All calendar weeks between those endpoints count toward the average, including unlogged weeks. `windowEnd` is that week’s Sunday, even if the latest session was earlier in the week. The Per week tile uses this endpoint only after the actual latest session is more than seven elapsed days old; otherwise it shows planned workout frequency. Total finished Workouts replaces elapsed weeks on the plan.

Chart occupancy is separate from average denominators: weekly effort and MuscleDetail weekly sets omit weeks with no finished session in scope. A finished session with no hard sets for the selected muscle is a real zero; missing logged effort remains null. The series omits these weeks; shared chart rendering is responsible for drawing the gaps.


## 2026-11-02: Caching analytics and refreshing screens only when data changed (T-091)

The owner saw analytics recalculate on every visit and every period chip. Measured first: on a seeded synthetic history at their scale (953 workouts, 25.6k sets, 80 exercises; `make bench`), a single Analytics section took 0.7–5 s and repeating it cost the same. Two causes: nothing was remembered, and each lift's history read looked up the exercise once per workout in the whole history (a correlated `EXISTS` that SQLite answered through the exerciseId index, about 950 × 300 probes per lift).

**Worker cache, owned by the connection.** `Database` counts writes in `dataVersion` (every `run`/`exec`, so every write, import step and migration, plus a rollback that undid writes; read-only transactions leave it alone). `Database.cache` (`QueryCache`) keys results by query name and arguments and drops everything the first time it is read at a new version, so a cached result always equals a fresh one. A restore opens a new connection, which starts with an empty cache. Entries are bounded (600, least recently used dropped first) and shared by reference; query results are already typed read-only.

What is cached: the per-lift pieces every analytics call re-derived (`ExerciseSessions.all`, now the single SQL read of a lift's finished history, feeding `ExerciseSeries.read`, `ExerciseCurve` and `ExerciseStrength.series`, which no longer run their own queries), `TemplateSessions.read`, and in the worker the whole period results (overview, ranking, muscle dashboard and detail, intensity mix, weekly effort) plus the exercise list and detail. Calls that take "now" key it as `'all'` whenever it is at or after the newest finished workout (`historyBoundaryKey`), which reads exactly the same rows; inclusive-date calls key their end by local calendar day, which is all they read. Calls whose result depends on the exact clock (progress trend windows, plan staleness) are not cached whole; they recompute from the cached pieces in a few milliseconds.

**Screens.** `useDatabaseQuery` keeps the last 50 results by key (`QueryResultStore`) and shows a remembered result at once. It re-reads in the background only when the worker has announced a newer data version (change notifications now carry it) or the result is over a minute old (heuristic, for clock-dependent screens). One worker subscription serves the whole app, and a burst of writes becomes one refresh per animation frame (`ChangeCoalescer`, 100 ms when the page is hidden). Two reads of the same key share one request unless a write happened in between, and an older read never overwrites a newer one. A key the screen has never shown still keeps the previous key's result until its own arrives, as before.

Period ranges were already stable: `analyticsPeriod` rounds to local Monday weeks, so the keys do not change between mounts and `analyticsPeriod.ts` is unchanged. No index or migration was needed; rewriting the lookup as `w.id IN (SELECT workoutId … WHERE exerciseId = ?)` reads the lift's workouts once. No extra threads: everything heavy already runs in the worker, and the remaining cold cost is SQLite returning rows, not rendering.


## 2026-11-02: Target range storage (T-089)

Migration v16 keeps the existing RPE and rest targets as lower bounds and adds nullable upper bounds. A NULL upper bound represents a single value. Double progression compares logged effort with the RPE upper bound when present.


## 2026-11-02: Analytics tabs return and overall strength is relative (T-087)

Pinned, Overview, Muscles and Effort are separate URL-selected views. The resolved default (Pinned
with pins, otherwise Overview) is saved in the URL, so unpinning and back navigation retain the view.
One shared period control also appears on Pinned because its card changes depend on that period.
Each view loads its own sections.

Strength counts only lifts with at least two qualifying, non-deload sessions inside the period;
pre-period history is a baseline, never a substitute for those two sessions. Typical lift is the
median percentage change, giving a small curl and a heavy squat equal weight. Heuristic: changes
within ±1%, inclusive, are flat. The weekly strength index takes the median relative to each lift's
period baseline, carries forward between observations, and admits late-starting lifts at their first
value. It never backfills them before they were observed. Membership can therefore change during
the period. Deload sessions remain absent from both the trend and eligibility count. This follows
the existing lift trend's conservative rule of excluding a session if any occurrence of that lift
is a deload. No persisted metric or schema change is needed.


## 2026-11-02: Automatic saved-workout progression preferences (T-090)

Supersedes the T-060 opt-in switch and T-089 range confirmation. Suggestions now appear for every
eligible saved-workout occurrence unless Off is selected. They remain red values accepted individually
by tapping; starting or completing a set never accepts them. Targets… owns rep/RPE ranges. Progression…
only chooses Automatic, Reps first, Weight first or Off. Legacy `progression = 'double'` means Reps first
until a new preference is chosen; choosing Automatic clears that legacy override.

Heuristic: Fine compound jumps default to Weight first only for barbell/trap-bar compounds when one
load step is at most 2.5% of the latest normal session's heaviest working load. Everything else defaults
to Reps first, including missing/zero load history. This is conservative within report load-calculator
item 5's 4% cutoff; the report's “Coarse weight jumps need double progression” and item 6 support using
reps for coarse jumps. The entry-unit equipment ladder and exact kg overrides remain authoritative.
Reps first retains the existing per-position one-rep rule; Weight first requires all matching working
positions at/above their low bounds and at/below their RPE ceilings, adds one load step and retains reps
inside the range. Unknown effort blocks Weight first when a ceiling exists; legacy Reps first keeps its
unknown-effort behavior. Missing/extra working positions block a load jump.

The last three finished non-deload sessions are scoped strictly to this saved workout, exercise
occurrence and recorded manufacturer. Other-workout history can still fill grey boxes when no scoped
history exists but never establishes a suggestion. Normal scoped history also seeds the saved baseline,
so a latest deload does not substitute its reduced load. Active deload suggestions keep priority.

Heuristic: top means heaviest completed non-warm-up set, breaking ties by reps then logged order.
Hold an otherwise qualifying load jump, retaining its previous reps, when its RPE rose from oldest to
middle, did not fall from middle to newest, and both middle/newest reached the newest top position's current target ceiling. Thus 7 → 8 → 8 at ceiling 8
holds; a flat 8 → 8 → 8, missing effort/ceiling or fewer than three normal sessions cannot establish
this hold. Rep-only increases remain available. This interprets the owner's “last three workouts” rule
as rising to and remaining at the ceiling for two sessions; it is not a fatigue diagnosis or a deload trigger.

There is no exercise-wide rep-range field. Heuristic: the first complete working target supplies the
exercise range for load-only calculations on positions without their own range. Those positions never
suggest reps. With no complete range there are no suggestions. Bodyweight remains reps-only. Timed
tracking resolves to Reps first but retains no numeric progression: its targets are seconds, not reps.


## 2026-11-02: Read period sets once, expand muscle associations in TypeScript (T-093)

Muscle coverage and weekly volume previously transferred a row for every set × muscle association
through SQLite WebAssembly. `AnalyticsHistory` now reads each completed set once, with seven fields,
and keeps the small exercise-to-muscle map and exercise metadata in the same connection cache.
Coverage, dashboard effort, weekly volume and intensity share the read when the exact half-open range
and optional current plan membership match. Writes invalidate rows and metadata together through the
existing data version; there is no persisted aggregate, new index or migration.

The dashboard groups direct logged effort in one pass instead of scanning the period once for each
muscle. Detail reuses the dashboard's lift calculation. Weekly volume still delegates counting,
secondary weights, zones and session flags to `muscleVolume`. Deload, unknown-effort and custom/untagged
exercise semantics stay unchanged. Weekly effort keeps its existing session-aware query because empty
sessions and sessions without this muscle must still establish occupied weeks.

Intensity uses a binary search for the latest trend point on or before each local date. This removes
the per-set full trend filter while handling repeated dates without relying on the order of input
sets' local date labels. Session-best fallback and existing estimate formulas are unchanged.

Template sessions use one scoped set read grouped by workout instead of reading each full workout
detail; order, empty sessions, duration rules, counts and estimates remain identical. The predecessor
lookup in `PreviousPerformance` uses an exercise-indexed `IN` membership read instead of correlated
`EXISTS`; occurrence and machine matching retain their existing rules.

On the synthetic 953-workout history, cold All muscle detail fell from 1,584 to 662 ms and the combined
tab from 1,310 to 774 ms. The 400 ms goal remains unmet. Remaining costs include the canonical per-lift
full-history reads, the shared period rows and the session-aware effort queries. Benchmark warnings
now use the 400 ms cold target so the remaining gap stays visible.


## 2026-11-02: Preserve unaffected lift histories after writes (T-094)

The T-091 global cache remains the contract for screens and cross-exercise queries. Per-exercise
sessions (including pages), curves, chart histories and strength series now follow an exercise
revision instead. Their history-boundary keys use the latest finished workout containing that lift,
so moving another lift's workout into the future cannot change an untouched lift's cache key.
Historical timestamps, the trend's local day/time zone and curve metadata inputs remain explicit keys.
Unscoped per-lift period trends also reuse their own calculation, keyed by exact period endpoints;
the aggregate ranking still rechecks membership globally. Plan-filtered trends remain global because
they read current template membership.

Connection-local TEMP triggers track old/new exercise owners and workout membership, including
foreign-key cascades and REPLACE deletes. No schema migration or persisted aggregates are needed.
Unrelated tables, new workouts/imports, scripts, schema changes, unknown/failed writes and overflow
fall back to full invalidation. Heuristic: cap tracked ids at 256 exercises per statement; one extra
id detects overflow while bounding memory. An update to exercise muscles invalidates that lift even
though the current curve does not read those rows, preserving a conservative dependency boundary.

Revisions advance after each statement rather than waiting for commit because core queries may run
inside a transaction. A rollback invalidates every lift: TEMP rows roll back too, and a cached query
may have observed intermediate data that no longer exists. Main and TEMP schema revisions cause
tracking to rebuild after migrations, rolled-back DDL or removed triggers. The existing global
version and worker API remain unchanged. Template and alias writes in a merge deliberately invalidate
all lifts because those tables are outside the audited per-exercise dependency set.

## 2026-11-02: One built-in Dropbox key for friends; restore from Dropbox (T-095)

- **One key, many people.** The built-in app key is public (PKCE, no secret). Each person connects their own Dropbox through it and the App-folder grant keeps their backups in their own account, so friends do not need their own app. Dropbox allows about 50 people to connect to an app in development status before it asks for a production review; past that, people use their own app (the collapsed "Advanced" checklist in Settings → Dropbox) or apply for production.
- **Own-app setup is a checklist.** Create app (Scoped access, App folder), tick `files.metadata.read`, `files.content.write` and `files.content.read`, paste the App key. The permission names have Copy buttons because typing them on a phone is error-prone.
- **Restore from Dropbox reuses the file restore.** The downloaded bytes go through the worker's `restoreBackup` (validate, safety snapshot, replace, roll back on failure), so there is one restore path. A cloud file is offered only when `listCloudBackups` accepts it, the same filter retention uses, so restore can never offer a file retention would not manage. After a restore the Dropbox state is reconciled with this phone's token and the restored settings (`reconcile`), which may upload the restored state as a new backup because a backup exported mid-upload carries `pending = true`.


## 2026-11-02: Restore discovery before backing up an empty phone (T-095)

A fresh Home Screen install has neither the owner's database nor a Dropbox token. Connecting must not upload the seeded empty database and start pruning good backups. One core `isDatabaseEmpty` query, exposed by one worker method, gates every cloud upload. It counts unfinished sessions as data and conservatively includes saved plans, imported exercises, archived custom exercises and custom body parts; seeded library/sites and settings alone do not count. Manual Files exports are unchanged.

After an empty-phone connection, list backups and offer the restore sheet when any exist; require explicit replacement confirmation before download. Sort restore choices by filename UTC time, while retention continues to use server time. OAuth now requests `files.content.read` as well as write/metadata access; older grants need disconnect/reconnect before download, with readable guidance on refusal. Downloaded bytes enter the existing worker restore unchanged so validation, snapshot-before-replace, migration and rollback stay in one implementation. Discovery/download/restore failures never schedule an automatic upload or retry a restore. A disabled app key clears its grant and pending upload; changing the key or updating JEM is the recovery path. Dropbox's external authorization error page cannot be inspected by JEM, so Advanced explains that case too.

## 2026-11-02: New built-in Dropbox app key

- The owner deleted the first Dropbox app (`jzqiomik3a47qoz`), and Dropbox now reports it as `disabled_app`, so connecting failed. The owner created a new App folder app with the same permissions; its public key `b8z4v0ynb7g98v6` is now the built-in default.
- Backups made by the old app stay in the owner's Dropbox under its old app folder; the new app can't see them, so backups start again in the new app's folder.

## 2026-11-02: Always-on warm-ups, compact set rows, no mid-workout settings (T-098)

- **Warm-ups are automatic.** Reverses T-053 (opt-in). An exercise with no warm-up count of its own gets the heuristic default for its kind (`automaticWarmupCount`: three for a big barbell compound, two for other compounds, one for isolation, none for bodyweight, band and timed work), computed from the first working set (50% and 75% for two, and so on, rounded down to a loadable weight). A count the owner sets on the exercise still wins, and 0 turns them off for that exercise. Generated warm-ups only fill untouched slots: edited, completed or template-placed warm-ups are never overwritten, and a template that already holds warm-ups for an exercise gets none generated beside them. The in-workout "Add/Remove suggested warm-ups" action is gone (a worker API and its tests with it); "Add warm-up set" stays.
- **Setting targets, rest time and notes happens when editing the saved workout**, not in the live exercise menu. The live card still shows them as text.
- **Typed value boxes are sized for what they hold** (`--workout-weight-box`, `--workout-reps-box`): weight five characters, reps three. The leftover width goes to Previous.
- **Number-pad keys fold into the latest draft** (`applyDraftChange`): two taps before React redraws ("1" then "5") both apply. The RPE chip on a set follows the pad while RPE is typed.

## 2026-11-02: Links are accent text, and Settings says which Dropbox app is in use (T-099)

- **No underlined links.** One zero-specificity rule in `global.css` makes every link accent-coloured without an underline; a component that wants otherwise sets it.
- **The normal Dropbox path and Advanced are the same thing with a different app.** The normal path uses the Dropbox app built into JEM (`DROPBOX_APP_KEY`): tap Open Dropbox, backups go to an App folder in the person's own Dropbox. Advanced lets a phone connect through a different Dropbox app, which only matters when the built-in app is switched off or over Dropbox's limit of about 50 connected people. Settings now states which app is in use and offers the built-in one back.
- **A saved key of a deleted app is dropped** (`RETIRED_DROPBOX_APP_KEYS`). A phone that once saved the old key in Advanced kept connecting through the dead app, and Dropbox answered "app disabled" whatever the built-in key was.
- **Live set rows align titles to their boxes**: the value box is only as wide as its content and sits at the left of its column, so the KG / REPS titles sit over the box, not over the column.

## 2026-11-02: One Dropbox connection method; the workout in progress hides the tab bar (T-100)

- **Paste-the-code is the only Dropbox connection.** The redirect flow (Open Dropbox → Allow → back in JEM) could never work for a Home Screen web app: Safari completes the Dropbox sign-in in its own storage, so JEM is never told and "nothing happens". The redirect code, state parameter, redirect-URI setup step and Settings return handling were deleted. The same two steps (Open Dropbox, paste the code) serve Settings and the empty-phone Restore card.
- **Reset Dropbox on this phone** forgets the connection, a pending step and any saved app key, trying to revoke first but never stopping if that fails. This is the way out of a stuck key or a dead app.
- **While a workout is on screen the tab bar is hidden**, so a stray tap cannot leave it. Swiping the top bar down (or its chevron) minimizes the workout: the tabs return with a "Resume" strip above them, and the Workout tab shows its start screen with starting disabled. The minimized state lives only as long as the page; reopening the app shows the workout again.
- **The app name on the Home Screen is fixed when the icon is added.** iOS copies the web app's title at that moment; renaming it in code (it is already "JEM") does not change an existing icon. Re-adding the icon starts an empty, separate storage, so back up first and restore afterwards.

## 2026-11-02: One entry file for every agent, plans in `.claude-plans/`, and no archive of finished work in the docs
- **One entry file.** `CLAUDE.md` is a symlink to `AGENTS.md`, so Claude Code, Codex and other tools read the same text and it cannot drift. Claude-specific operating notes live in `docs/agents/WORKFLOW.md`.
- **Plans live in `.claude-plans/`.** A multi-step piece of work keeps its steps, status and next action in one file there, updated as each step finishes, so a different agent can resume after a stop. Tasks (`docs/tasks/`) are the unit of work for one agent; a plan can span several tasks and sessions.
- **Docs describe the present.** Finished task briefs, the native reference, the first-pass data-model table, per-milestone status logs and design proposals that have all been built were deleted. Their decisions are in this file and their history is in git. Stale docs mislead agents more than missing ones.

## 2026-11-02: `main` is the only base branch, and every merge is published
- **Decision:** every branch starts from the latest `main` and merges back into it. The `web` milestone branch is retired: it had fallen 19 commits behind `main`, and the docs still told agents to branch from it. Merging does not publish by itself; the agent that merges runs `make deploy` (or the Deploy workflow by hand) straight after, every time (owner, 2026-11-04). A merged branch is deleted by whoever merged it, and every session prunes branches already in `main`; seven branches had piled up because nothing said to delete them.
- **Why:** agents from different tools were told different bases, which would rebuild work on old code and cause merge conflicts. The owner checks work only on the phone, so an unpublished merge is invisible to them; publishing every merge replaced an earlier rule of publishing only on request. The workflow runs on a push to `main`; until 2026-11-04 no push had started it, so agents confirm a run for each pushed commit and start one by hand when needed.
- **Alternatives:** keeping `web` as an integration branch (needs regular syncing nobody does); publishing only when the owner asks (left merged work invisible to them); relying on the push trigger alone (it did not fire for months, so it is checked rather than trusted).

## 2026-11-04: Set rows share one label chip, an inset, a fixed gap and a band for every kind
- **Decision:** the set label ("W", "1", "D", "F") is one chip on the live workout, the workout preview and the workout editor: as tall as the value boxes and in the same 15 px type. Rows are inset 8 px inside their tint, and each row's tint is clipped 2 px short at top and bottom, so neighbouring rows always stand 4 px apart. Live rows grew from 40 to 44 px to keep 5 px between a box and the edge of its tint. The editor tints warm-ups like the other two screens and insets its rows into the same rounded bands. Working sets get a faint accent band and a thin accent outline (owner's request), so every set reads as a row; completed sets keep the stronger accent fill, so done and not done stay distinct. Chips, boxes and checks on a tinted row take the row's tint so they stay visible in light mode.
- **Why:** the owner found the boxes touching the edges of the warm-up tint, the W looking larger than the set numbers (13 px labels, numbers in the faint tertiary grey, and a chip that stretched to 44 px in the preview and was missing for numbers in the editor), and tinted rows fusing into blocks so that a failure set looked detached from the set before it.
- **Alternatives:** a single band around all warm-ups (breaks as soon as a warm-up sits between working sets); margins between rows (would leave gaps in the swipe-to-delete area); keeping 40 px live rows (boxes 3 px from the tint's edge).

## 2026-11-04: Reliability pass: one pointer helper, a light chrome query, one number rule, checked branches
- **Decision:** every swipe and drag follows its pointer through `followPointer` (`src/app/design/gestures/`). The tab bar and resume strip read `activeWorkoutSummary` (one row) instead of the live-workout snapshot, and the Workout tab checks for an empty phone only when no workout is live. Strong measurement values use `readExportNumber`, so an ambiguous `1,234` stops the measurement import and names its line, as it does for workouts. A *Verify* workflow runs `make verify` on every branch push and pull request. The workflows' actions are pinned to their first Node 24 majors (checkout, setup-node, upload-pages-artifact and deploy-pages, all `v5`).
- **Why:** three hand-written copies of window pointer handling meant an iOS fix had to be made three times; the chrome and emptiness reads re-ran after every logged set for nothing; measurements read `1,234` as 1.234 while workouts refused it; `main` is published on every merge, so checks have to run before it; GitHub retired Node 20 for actions.
- **Alternatives:** the newest action majors (v6/v7, with changes not needed here); skipping ambiguous measurement rows instead of stopping (a silently missing measurement is harder to notice than an error naming the line).

## 2026-11-04: Review follow-ups: what changed, and what was dropped on purpose
- **Decision:** the workout editor keeps an unsaved draft in its own history entry and in the exercise page's back link (`TemplateDraftState`), so a swipe back or a reload keeps it. The minimized workout is remembered by id, so it cannot carry over to the next workout. The start screen holds the restore card (it hides itself unless the phone is empty) and the Dropbox restore sheet is mounted once in `AppChrome`. The app-key form reads the Dropbox state itself and offers Reset whenever there is a connection (working or needing a reconnect), a half-done one, or a saved key. The finish summary uses `Section`/`SectionRow`. Reading the Dropbox app key never writes; a retired key is removed once at start-up. The worker refuses a cloud backup of an empty phone (`exportCloudBackup`).
- **Dropped on purpose (do not redo without new evidence):** checking emptiness once on Dropbox connect (it needs `pending` set after the export, which makes the export's change version stale so `pending` never clears); caching the restore list's formatters (30 rows, nothing to gain); trimming History's exercise lines to five per workout (measured on 953 synthetic workouts: about 1 MB, 16% smaller, about 1 ms); one shared warm-up policy function (the logger already reuses the preview's generated-set ids; the other two places are different situations); one presentation hook for the chrome and the Workout tab (the chrome must keep its one-row query); collapsing `minimizeWorkout`/`resumeWorkout` into one setter (less readable); dropping `RestoreFileSheet`'s `showAction` (it keeps the restore result on screen after the card disappears).
- **Kept as is:** `ExerciseBestsTable` keys rows by index, because the same exercise can appear twice in a workout; the unset `--workout-rpe-box` token has a harmless 34 px fallback.

