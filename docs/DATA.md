# Data: storage, backups, import

## Where data lives

| Copy | Location | Written when |
|---|---|---|
| **Live database** | On the phone, in the Home Screen app's private file system (OPFS), file `/workouts.sqlite` in SQLite's storage pool named `workout-tracker` | Every change |
| **Local safety snapshots** | Same pool, `/snapshot-<UTC time>.sqlite`; the newest 3 are kept | Before migrations, restore, import, merges, History edit entry and History workout deletion |
| **Manual backups** | Wherever the owner saves them, normally a folder in iCloud Drive | When the owner taps **Back up** |
| **Dropbox backups (optional)** | The owner's Dropbox, in this app's folder only | After connecting, every finished workout, and pending retries |

- The app asks the browser for **persistent storage** at launch, so iOS never clears it to save space. Home Screen web apps are exempt from Safari's 7-day storage limit for websites.
- The Home Screen app has its own storage, separate from Safari's. Opening the same address in a Safari tab shows an empty app; that's expected.
- **Deleting the Home Screen icon deletes the data.** Restore from a backup afterwards.
- The host only serves the app's code. The only data sent off the phone is a full backup to the owner's Dropbox after they explicitly connect it.

### Exercise loading settings (schema v5)

`v5-exercise-load-settings` appends three nullable columns to `exercise` without rewriting rows:

- `loadStepKilograms REAL`: positive total-load increment, in exact kilograms (plate pairs are already included).
- `barWeightKilograms REAL`: nonnegative empty bar/carriage load, in exact kilograms.
- `warmupSetCount INTEGER CHECK (warmupSetCount BETWEEN 0 AND 4)`: null and zero disable automatic generation; 1–4 enable that many sets.

Null loading values use the equipment defaults in `LoadableWeight.ts`. The editor converts values from the exercise's entry unit once; stored overrides stay exact when the entry unit changes. Built-in exercises permit loading-only edits while their library metadata stays read-only. Older in-memory model callers may omit the fields; database rows always include nulls or values.

Generated warm-ups are ordinary uncompleted `workoutSet` rows before the work sets. Completed rows retain their values and timestamps. Manual warm-up edits and delete-all suppression are tracked in the logger's memory, never new schema columns. After a worker reload, existing warm-ups are treated as protected and missing warm-ups on an already-loaded entry stay missing; an entry with an enabled count and no first work load can generate when filled in. An explicit request uses the equipment/mechanic heuristic and can remove only untouched suggestions. Backups contain the planned rows and the loading settings, without transient edit provenance. The existing worker snapshot-before-migration path handles v5.

### Backups

Manual backups to Files / iCloud Drive take one tap and remain available alongside optional automatic Dropbox backups:

- **Back up** exports the whole database as one file, `WorkoutTracker-YYYY-MM-DDTHH-mm-ss.sqlite` (UTC, sortable), and opens the iOS share sheet. Choose **Save to Files** and the same iCloud Drive folder each time. If sharing isn't available, the file downloads instead.
- Each backup is a complete, self-contained SQLite file that any SQLite tool can open.
- Settings always shows the date of the last backup. Every finish-workout summary offers **Back up now** and shows the last backup age; the caption is a quiet reminder when it is more than 7 days old. The owner must tap the button and save the file in the share sheet.
- **Restore:** pick a backup file. The app checks it is SQLite, has a known schema and wasn't made by a newer version, takes a local safety snapshot of the current data, then replaces the live database and reopens it.
- Manual backups are the owner's files; the app never deletes them.

#### Connect Dropbox (once on this phone)

There is one way to connect: paste a code. A redirect back into JEM cannot work for a Home Screen web app (Safari finishes the Dropbox sign-in in its own storage, so JEM never hears back), so it was removed on 2026-11-02.

1. Open **Settings → Dropbox → Open Dropbox** (on an empty phone the same two steps appear in the **Restore your data** card on the Workout tab). Allow a new tab if Safari asks.
2. Tap **Allow**, copy the code Dropbox shows, return to the Home Screen app, paste it and tap **Connect**. JEM uploads the first backup if this phone has data. An empty phone uploads nothing and opens the restore choices if backups exist.
3. Confirm **Connected · last backup just now**. **Back up to Dropbox now** uploads manually; **Disconnect** revokes access and clears this phone's connection, without deleting any Dropbox files.

JEM connects through its built-in Dropbox app (`DROPBOX_APP_KEY`). **Dropbox app and reset** says which app is in use. To use a different Dropbox app (the built-in one is switched off, lacks a permission, or is over Dropbox's limit of about 50 people): create an app at dropbox.com/developers/apps with **Scoped access** and **App folder**, enable `files.metadata.read`, `files.content.write` and `files.content.read`, enter its App key and save it, then connect again. No redirect link and no client secret are needed. Changing the key revokes the old connection first. **Reset Dropbox on this phone** forgets the connection, a half-done connection and any saved key (trying to revoke first, never stopping if that fails) and returns to the built-in app; it never touches workouts or files in Dropbox. A saved key of a deleted app is dropped automatically.

Backups are visible only to the Dropbox app that made them. Connecting through another app (or a different key) shows an empty folder, so keep using the same app for a given backup history.

After each saved workout the app uploads the same validated `.sqlite` export used by the share sheet, under `/WorkoutTracker-YYYY-MM-DDTHH-mm-ss.sqlite` (UTC). Uploads never hold up finishing the workout. The summary shows progress, success, or a readable failure with **Try again**; **Back up now** still opens the share sheet.

A failed upload remains pending and retries when the app next opens or receives an `online` event. Keep the app open long enough to finish: iOS can suspend background web apps. If Dropbox revokes access, the app forgets the rejected credentials and offers **Reconnect Dropbox**. Backups require a connection; logging always works offline.

The refresh token and optional public app key are persisted in this phone's `localStorage`, under `workout-tracker.dropbox.refresh-token` and `workout-tracker.dropbox.app-key`; the pending PKCE verifier, independent random OAuth state (redirect only) and creation time live under `workout-tracker.dropbox.pending-verifier` for up to 10 minutes, bound to the app key. This lets connection resume after an iOS restart. On return to Settings, OAuth query parameters are removed immediately before any asynchronous work; the reply must match the stored state before exchanging a code with the same redirect URI used to authorize. Missing/different state, expiry and denied access show readable failures without exchanging. The pending step is removed before exchanging a nonblank code, on denied access, disconnect, or a key change; expired entries are removed when checked. After a failed exchange, tap **Open Dropbox** for a new grant; fallback pasted text stays visible. Access tokens stay in memory. Codes are never persisted. Credentials never enter SQLite, logs, or backup files. The non-secret `appSetting` rows are `cloudBackupProvider`, `lastCloudBackupAt`, and `cloudBackupPending`. Restoring a backup on another phone does not connect its Dropbox; connect again there. Clearing website data or deleting the Home Screen app requires connecting again too.

After a successful upload the app lists the complete Dropbox app-folder root, keeping the newest **14** app backups plus the **earliest backup of each calendar month in the phone's local time**, ordered by Dropbox's server timestamp. It deletes only exact app backup filenames; unrelated files, subfolders, manual backups elsewhere, and local safety snapshots are untouched. A failed upload never runs retention. A retention failure still records the successful upload and leaves a pending retry. Changes saved during an upload retain a pending retry so a stale export cannot mark newer data as backed up.

To restore directly, open **Settings → Dropbox → Restore from Dropbox…**. Only exact JEM backup names in the app-folder root are listed, newest filename time first, with local date/time and byte size. The first 30 are shown; **Show older** reveals 30 more. Choose a backup and confirm **Restore this backup?** before anything downloads. **Downloading…** and **Restoring…** show progress, then the finished-workout count confirms success. It uses the same worker validation, safety snapshot, migration and rollback path as restoring a file; the entire database returns, including saved workouts, plans, custom exercises, measurements, pins and settings. Dropbox credentials remain phone-local. Phones connected before direct restore was added need to **Disconnect** and connect again to grant `files.content.read`; existing backups stay in Dropbox. New connections request this scope alongside write and metadata access.

A phone is empty when it has no workouts (including unfinished ones), saved workouts/plans, measurements, or custom/imported exercises or custom body parts. Seeded library exercises, built-in measurement sites and settings alone do not count. **An empty phone never uploads**, on connect, a manual Dropbox backup, app launch, an online retry, or a finish notification. Connecting it lists existing backups instead and opens restore choices when any exist; restoration still needs confirmation. No retention runs unless a non-empty database was uploaded successfully.

On an empty phone, the Workout tab offers a small **Restore your data** card: **Restore from Dropbox** connects first if necessary, then offers backups; **Restore from a file** uses the same file picker and confirmation as Settings. The card disappears once there is data. A new installation needs Dropbox authorization again; restore is offered, never applied automatically. The Files route remains available offline.

If Dropbox returns `invalid_client`, JEM shows **This Dropbox app is switched off. Create a new one in Advanced, or update JEM.** It clears the unusable grant and stops automatic retries. Advanced also explains this if Dropbox displays an authorization error page instead of returning to JEM.

### Data loss scenarios

| Event | Outcome |
|---|---|
| No connection at the gym | Nothing happens: the app and data are on the phone. |
| A new version fails to download | The installed version keeps working. |
| Home Screen icon deleted / phone lost | Re-add the app, then restore the newest backup. |
| Bad migration or bug | The worker snapshotted before migrating; restore that snapshot or a backup. |

## Hosting

- Address: **https://bader-almutlaq.github.io/JEM/** (GitHub Pages, public repository `Bader-Almutlaq/workout-tracker`). It only serves the app's code; workout data is never uploaded to the host.
- Publish with `make deploy` (pushes `main`, then runs the *Deploy* workflow, which runs `make verify` before publishing, so a failing build never ships). Pushes alone have not been triggering the workflow, so always use `make deploy`.
- The installed app picks up a new version in the background and shows "Update ready"; nothing reloads until the owner taps Update.
- Roll back: `git revert` the bad commit on `main`, then `make deploy`.
- The owner's personal GitHub site had an expired custom domain (bader-almutlaq.me) that redirected every project; it was removed on 2026-10-30.

## Logging state

- At most one workout has `isInProgress = 1`: the one being logged. History and analytics ignore it until it is finished.
- While logging, sets exist as **planned** (`isCompleted = 0`), pre-filled from the last session, or **completed** (`isCompleted = 1`, with `completedAt` and `restBeforeSeconds`, the time since the previous completed set in the workout).
- Finishing deletes planned sets that were never completed, and exercises left with no sets. So **every set of a finished workout was performed**, and imported sets count as completed. A workout finished with nothing completed is deleted.
- Every tap is its own transaction, so a crash loses nothing already shown on screen.

## Units

All weights are stored in **kilograms, exactly as entered** (`Double`). Each set also records the unit it was entered in (`kg` or `lb`), so it can be displayed the way it was typed. Conversion uses 1 lb = 0.45359237 kg (exact, by definition).

## Strong export (owner's file, profiled 2026-10-29)

`export_data/strong_workouts.csv`: 23,198 sets, 983 workouts, 85 exercise names, 2021-11-20 → 2026-10-02.

- **Format:** comma-delimited, RFC 4180 quoting, header `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE`. This is the older layout: no `Workout #`, and durations are text such as `1h 7m` or `59m`. A workout is identified by its `Date` (start timestamp, local time, `yyyy-MM-dd HH:mm:ss`).
- **Weight** column is nominally kg, with three classes of value:
  - **Round kg** (multiple of 0.25 kg): 19,599 sets.
  - **Typed in lb** (value ÷ 0.45359237 is a round lb number, e.g. 61.23 = 135 lb, 49.9 = 110 lb, 47.17 = 104 lb): about 1,900 sets, mostly Bench Press (Barbell), Upper Seated Row, Shrug (Machine), Under Grip Row, Lat Pulldown (Machine). The importer keeps the kg value and sets entry unit = lb.
  - **Exercises whose column is actually in pounds**: 1,676 sets whose value × 0.45359237 is a round kg number (99.21 = 45 kg, 63.93 = 29 kg, 35.27 = 16 kg). Strong stores a unit **per exercise** and converts the history when the owner switches it (the owner confirmed this habit, 2026-10-29). The export writes each exercise in its *current* unit, despite the header. The evidence is consistent: Seated Leg Curl (Machine) has kg-typed sets 2021-11 → 2026-06 (45 kg shown as 99.21) and then round-lb sets 2026-06 → 2026-09 (140–200 lb). Reverse Fly (Machine), Standing Calf Raise (Machine), Chest Fly and Lateral Raise (Machine) show the same pattern.
  - **Importer rule (`ExportUnitResolver`):** each non-round value votes for the reading under which it is a round typed number (strict 0.006 tolerance); round values don't vote; the majority wins, ties go to kg. On the owner's export this picks exactly the five exercises above, unanimously (e.g. Seated Leg Curl 804–0), and no kg exercise gets a single lb vote. The whole column is then converted to kg and each set's entry unit inferred. The import review lists the lb exercises and the owner can override any.

**Verified 2026-10-29 with `make import-report`:** 983 workouts, 23,199 sets (22,848 non-warm-up), 89 measurements across 15 sites, tonnage 9,568,149.54 kg. That matches an independent Python recomputation to the cent. 54 sets (0.2%) are flagged for review, including clear typos such as 35 kg × 454 reps and a 7 kg set in a 70 kg squat session.
- **Set Order:** `1…6` for working sets; `W` warm-up (351), `D` drop set (417), `F` failure (1,999). Lettered sets take the next position within the exercise.
- **RPE:** integers 6–10 on 92% of sets; empty = unknown.
- **Distance and Seconds** are all zero. **Notes** (per set) are empty; **Workout Notes** appear on 160 rows.
- 633 sets have weight 0 (bodyweight movements such as pull-ups and dips). 1 set has 0 reps.
- Some durations are implausible (`8h 13m`) because workouts were left running. They're kept as-is, and analytics ignore duration outliers.
- About 30 of the 85 names are custom (e.g. "Bayesian Cable Curl", "Lateral raise Panata"); these need a mapping.

**Body measurements** come as one file per site (`strong_waist.csv`, `strong_left_bicep.csv`, …), header `Date,Measurement Type,Value,Unit,Source`, unit `cm`. There are 15 sites and few rows each. No bodyweight file exists.

## Other apps

Settings → **Import workouts…** asks which app the export came from, then shows its export steps. It accepts one workout CSV at a time; Strong also accepts measurement files. A recognized file from another app offers to switch and review it without picking it again. Headers identify the app (case-insensitive, any column order);
unknown columns are ignored. All adapters feed `StrongRow` into the same units, flagged-set,
Leave out all, matching and snapshot-before-import pipeline. **Each of the three formats below
is unverified against a real file** until the owner or a user supplies one; tests use small
synthetic CSVs based on the documented column layouts. Sources and confidence per format are in
`docs/research/import-formats.md`.

Numbers in every adapter go through `readExportNumber`: a decimal comma and digit grouping are accepted, and an ambiguous `1,234` (thousands or three decimals) is refused with its line. Strong's optional `Weight Unit` and `Distance Unit` columns set each row's unit (kg/lb, m/km/mi). Offsets without a colon (`+0000`, as Fitbod writes) are normalised before parsing because Safari rejects them.

| App | Columns and mapping |
|---|---|
| Hevy | Required: `title`, `start_time`, `exercise_title`. `end_time` determines workout duration; `description` → workout notes; `exercise_notes` → exercise note rows (identical repeated notes are stored once per workout/exercise). `set_type`: normal → working, warmup → warm-up, dropset → drop, failure → failure; unknown/blank labels → working. `weight_kg` or `weight_lbs` retains the explicit unit. `reps`, `rpe`, `distance_km` or `distance_miles`, `duration_seconds` → the corresponding set values (distance converted to meters). `set_index` is informational; file order determines set order. `superset_id` is ignored. |
| FitNotes | Required: `Date`, `Exercise`. Weight comes from `Weight (kgs)` / `Weight (kg)`, `Weight (lbs)` / `Weight (lb)`, or `Weight` with a per-row `Weight Unit` (`kgs`, `lbs`); the unit is retained. A header with a weight-like column this parser does not know stops the import instead of reading zero weights (the same guard applies to Hevy and Fitbod). `Reps` → reps, `Distance` with `Distance Unit` (`m`, `km`, `mi` or their English names) → meters; `Time` (`H:MM:SS`, `MM:SS` or seconds) → seconds; `Comment` or `Notes` → set note. Distance units also include `cm`, `in`, `ft`, `yd`. All sets are working sets in file order. `Category` is ignored. |
| Fitbod | Required: `Date`, `Exercise`. `Weight(kg)` or `Weight(lb)` retains the explicit unit. `Reps`, `Duration(s)`, `Distance(m)` → the corresponding set values. `isWarmup` true/1/yes → warm-up; false/0/no/blank → working. `Note` → set note. **`multiplier` is not applied:** dumbbell-pair weights stay as entered. `Incline` and `Resistance` are ignored because the normalized rows have no matching fields. |

Optional blank numeric cells are absent (weight/reps default to zero); malformed or negative
numbers are rejected with a column and row number. If both weight variants exist, a populated
kg cell wins, otherwise lb is used. Explicit units bypass Strong's numeric inference, including
entry-unit inference; a review override applies to every set of that exercise. Individual rows
can retain different explicit units in the same file. Optional missing measurement columns do
not prevent importing bodyweight or timed sets.

Hevy accepts local `26 Oct 2024, 18:00` and ISO dates/times; `start_time` is its workout key.
FitNotes accepts `YYYY-MM-DD`: one **FitNotes workout** per date, starting at **12:00 local**,
including dates with daylight-saving changes. Fitbod accepts numeric local dates/times and ISO:
one **Fitbod workout** per distinct start minute, or per date when no time is supplied (noon
local). This is a heuristic because no workout ID is available; separate sessions in the same
minute cannot be distinguished. ISO offsets preserve their instant; timestamps without an
offset use the phone's time zone, with the same gap/fold behavior as Strong. Noncontiguous rows
with the same workout key still form one workout, preserving their relative order.

Source keys use `hevy:`, `fitnotes:` and `fitbod:` prefixes, so re-importing the same file adds
nothing and different apps never collide. Importing the same real workout from two apps can
therefore create two records; cross-app deduplication is not attempted. The database's existing
`source = strong` classification remains the shared external-import category (no migration).
Exercise names use the existing matching flow; no library or matching behavior changes.

## Typo and outlier checks

Implemented once in WorkoutCore and used in two places:
- **Import review:** sets whose weight or reps are far outside that exercise's typical range near that date (likely a missed digit or extra zero) are listed for confirm / fix / ignore before the import commits. **Leave out all flagged sets** excludes them in one tap; Undo restores the previous exclusions. Individual controls remain available.
- **Live logging:** the same check asks "Is this right?" before saving a suspicious set.
An imported workout keeps its source key after edits. Re-importing never replaces its edited values. Deleting it records a tombstone, so re-importing will not bring it or its omitted sets back; add missing sets through History edit instead. If every set was left out of the original import, no workout or tombstone was created, and it can be imported later. The original export remains unchanged.


## Body measurements (T-043)

- `measurementSite` owns stable site keys, length/mass kind, left/right grouping, flexed support, display order and the editable how-to guide. Migration `v4-measurement-sites` freezes 16 defaults (15 Strong circumference sites plus bodyweight). Unknown legacy/imported slugs become custom length sites; original values are never guessed or changed.
- `bodyMeasurement` stores unrounded cm for lengths and kg for masses, a UTC timestamp, provenance, and `relaxed`/`flexed` state. Uniqueness is `(takenAt, site, state)`. New app entries retain their typed `entryUnit`; legacy/imported entries have null because their original typing unit is unknown. Editing preserves provenance. Duplicate entries are refused rather than overwritten.
- v4 rebuilds the table in one migration transaction, preserving ids, timestamps, values, source and the autoincrement high-water mark. Existing rows become relaxed. The worker takes its existing safety snapshot before migration; older backups validate and migrate through the existing restore flow.
- `lengthUnit` (`cm`/`in`, default `cm`) and `weightUnit` (`kg`/`lb`, default `kg`) are app settings for Body display. The existing app had per-exercise entry units and kg training analytics, but no global weight setting; Body provides the weight display picker. All units remain in backups. An inch is exactly 2.54 cm; lb conversion uses the existing weight owner.
- Changes are computed independently per state, relative to that state's latest observation. A 4-/12-week change subtracts the newest entry on or before latest minus 28/84 elapsed days; it is null if none exists. Since-first needs two entries. The monthly rate is a descriptive least-squares slope using observations in the inclusive last 84 days, scaled by a mean Gregorian month (365.2425 / 12 days); fewer than two distinct timestamps gives null. No interpolation or training recommendation is made.

- Body measurement display units are set in Settings → Units and included in database backups.

## Exercise library sources (T-047, schema v6)

`src/core/library/library.json` is generated offline by `node --import tsx tools/build-library.ts`.
The inputs are the unchanged pinned `data/sources/free-exercise-db/exercises.json` (provenance and
Unlicense in its `SOURCE.md`) and `data/sources/library-mapping.json`. The mapping freezes the
original 165 families/420 names in `baseFamilies` and records a match, new variant/family, or skip
for every source id. Change the mapping and increment its version before regenerating; never edit
the generated catalog. Exact original names/keys and primary tags survive; new aliases feed the
existing catalog/search. Duplicate source matches keep the first source id's details in lexical
order, and combine aliases. Explicit equipment/muscle overrides and resistance exceptions are
reviewable in the mapping. `weighted` represents unusual external implements (stones, sleds,
sandbags, chains) for which the existing equipment vocabulary has no dedicated slug; explicit
weight/repetition or weight/duration tracking keeps these external loads distinct from bodyweight work.

Migration `v6-library-details` adds nullable `exercise.instructions` (newline-separated steps)
and `exercise.imageKeys` (JSON source paths), plus frozen serratus, brachialis, brachioradialis,
tibialis and lower-traps rows. The worker's existing snapshot precedes migration. Seeding writes
details only to library rows; custom rows, including name collisions, are preserved. Nullable
columns retain all v5 rows, loading preferences, history and backup compatibility. Small-muscle
synergists are secondary tags; only direct serratus punches and tibialis raises get new primary
tags. Existing primary tags remain unchanged.

Instructions ship in the app and always work offline. Pictures are optional pinned jsDelivr JPEGs;
viewed frames use a bounded CacheFirst service-worker cache (600 frames, about 300 exercises).
Uncached pictures disappear quietly offline. **Settings → Show exercise pictures**, default on,
is a phone-local display preference outside database backups, like appearance. Turning it off
stops picture requests and display; it does not delete already cached pictures. **Settings → Credits**
links the public-domain source. Browser storage eviction can remove the picture cache; training
data remains independent of it.


## Export (T-048)

Settings → Export shares or downloads UTF-8 CSV files. Workout weights are always kilograms; choose kg when importing into Hevy. Exercise names are JEM's names. The first set carries the exercise note only when that set has no note; workout notes appear on the first workout row. Measurement values are cm or kg. A State column appears when any entry is flexed; Strong and Hevy do not use that column.

CSV is an interchange format, not a complete backup. `StrongCsvRoundTripLosses` records the fields lost or recreated when completed records are exported and imported:

- Workout: `id`, `source`, `sourceKey`, `templateId`.
- Workout exercise: `id`, `exerciseId`, `supersetGroup`, `notes`. An exercise note is placed in the first set's note only when that set has no note; it does not return as an exercise note.
- Workout set: `id`, `entryUnit`, `side`, `restBeforeSeconds`, `completedAt`.
- Body measurement: `id`, `source`, `entryUnit`.

The importer reads optional `State` values (`relaxed` or `flexed`); missing or empty state defaults to relaxed, so flexed and relaxed entries at the same time remain separate. Custom site names become slugs. Empty workouts and exercises have no rows, and incomplete sets and in-progress workouts are excluded. Timestamps have local whole-second precision and are ambiguous at daylight-saving transitions. Select kg explicitly for every exercise during import review: otherwise unit inference can misinterpret kg values. The importer trims surrounding whitespace in notes, converts zero duration or distance to missing, and accepts only RPE in its supported range. Adjacent occurrences of the same exercise name and workouts with identical local start times can merge on import. Use a database backup to preserve all data.


### Editing and deleting finished workouts (T-050)

History detail offers **Edit** only for finished workouts. Entering edit mode takes one complete local safety snapshot before enabling edits; subsequent field changes use the existing logging transactions and do not take additional snapshots. **Delete workout** confirms first, then takes a fresh snapshot immediately before deleting the workout tree. Snapshot failure blocks both entry and deletion, logs the underlying error, and shows a readable message. The existing pool keeps the newest three snapshots. Snapshots remain safety files, not an in-app Undo feature.

Metadata and notes save when leaving their field, matching the live number pad's commit-on-cell-change / Done behavior. Changes to the start preserve the exact elapsed duration, including across dates; a missing imported end remains unknown until a duration is entered. The UI edits local start time and elapsed minutes, while core validates timestamps and seconds. Notes keep line breaks. Set edits retain completion timestamps, rest, side and distance. Historical set additions are immediately performed with no invented completion timestamp; no automatic warm-ups are generated. Removing the last set removes its exercise entry and closes positions; removing all exercises leaves the finished workout available for editing or explicit deletion. Historical unit switches change only that entry's units and preserve exact kg and the exercise's future default. Live logging behavior is unchanged.

Imported edits retain `workout.sourceKey`, even when the name or start time changes. Deleting any externally imported workout writes its non-null source key to **`appSetting.deletedSourceKeys`**, a JSON array of strings, in the same transaction as the cascading delete. `WorkoutLogger` owns reading/writing this protection; the shared importer and its preview counts treat tombstoned keys as already imported. This applies to Strong and the other supported source prefixes without a schema change. Malformed JSON or non-string elements block import and imported deletion instead of silently losing protection. Database backups include tombstones; restoring a backup restores the tombstone state from that backup, so restoring a copy from before deletion intentionally restores that earlier history.

History weight and rep commits run the existing live typo check, excluding the edited workout from its own baseline. The value is already saved, consistently with immediate editing; **Save anyway** acknowledges it and **Fix** reopens the doubtful cell. Done waits for queued writes and stays in edit mode if a check needs an answer or a save failed. Each successful database write sends one notification, refreshing history, bests, comparisons and analytics through their existing queries.


### Exercise illustrations

The pinned everkinetic source and licence are in `data/sources/everkinetic/SOURCE.md`.
`data/sources/illustration-mapping.json` records a decision for each source image ID;
`tools/build-illustrations.ts` validates it against the library and generates the bundled
`src/core/library/illustrations.json` lookup. Images are fetched only when viewed.


## Per-workout progression (T-060, schema v8)

`v8-template-progression` appends `templateExercise.progression TEXT CHECK (progression IN ('double'))`.
NULL (including every existing row) is off. `double` enables reps-then-load suggestions for that
exercise occurrence in this saved workout. Rep ranges and optional RPE remain in each `templateSet`.
Saving and duplicating a template retain the setting; saving a performed session as a new template
leaves it off. Existing history and exact kilogram values are unchanged. The worker's existing
snapshot-before-migration boundary applies, and older backups validate by migrating an in-memory copy.

Suggestions are calculated on query, never stored. Both the grey baseline and progression calculation
prefer the latest finished session of the same template containing the exercise, falling back to the
latest finished session anywhere. Completed non-warm-up sets are paired by working position.
A tick saves the baseline values; only accepting amber or typing changes them. Untouched suggestions
reappear after reload. A value differing from its historical baseline suppresses that cell's suggestion;
accepting or typing an identical value is distinguishable only during the mounted editor session.

## Deload stages (T-062, schema v9)

`v9-deload` appends nullable `workoutExercise.deloadStage INTEGER CHECK (deloadStage IN (1, 2))`.
Every existing exercise entry stays normal (NULL); no sets or kilogram values are rewritten.
The existing worker snapshot-before-migration boundary applies. Complete SQLite backups carry the
stage automatically, and validation upgrades older backups on an in-memory copy. CSV formats are
unchanged and do not carry deload stages; use a database backup to retain them.

Starting deload sets stage 1 on the chosen live entry, or all entries currently in the workout.
The next performed session of that exercise occurrence starts at stage 2; after stage 2 it starts
normal. Discarding a session does not consume a stage. Occurrences follow their position among
entries of the same exercise, across workouts; this is independent of template progression mode.
Historical additions stay normal. Ending deload clears only the current entry. Finishing and editing
history preserve the stored stage, including set edits, unit switches and exercise reordering.

Suggestions never edit a set until accepted. Both stages use the normal session immediately before
the cycle as their load baseline, so stage 2 builds back toward that load instead of reducing stage 1
again. Reps repeat the immediate previous completed working position; sets stay unchanged. Missing
original positions omit their load suggestion. Normal logging resumes after stage 2 using the existing
previous-performance/progression behavior; it does not force a return to a particular weight.


## Machine manufacturers (T-063, schema v10)

`v10-machine-brand` adds nullable `machineBrand TEXT` to `workoutExercise` and
`templateExercise`. Existing rows remain NULL. Database backups include these columns and
older backups are validated after migration on an in-memory copy. Template storage normalizes
the name and preserves it when editing, duplicating, or creating a template from a workout.
The picker and machine-aware workout behavior are not yet implemented.

### Plan scheduling (schema v11)

`template.weekday` is nullable and uses ISO weekdays (Monday 1 through Sunday 7). `appSetting.activePlanId` stores the selected plan folder id; deleting that folder clears it. Both are included in database backups.

### Deload settings (v12)

Workout exercise rows retain nullable deload mode, load percent and set percent alongside the stage. Null preserves the original load-only defaults. They travel with database backups and survive History edits; the worker snapshots the database before applying the migration.

### Donkey Calf Raise tracking (v13)

Migration `v13-donkey-calf-raise-weighted` changes the original, unrenamed library row from bodyweight tracking to weight tracking. Set rows and weights are unchanged. The worker takes its usual snapshot before migration.

### Pinned exercises (v14)

`pinnedExercise` stores exercise IDs, display positions and pin timestamps. It is included in the SQLite backup and restore validation. Deleting an exercise cascades its pin; merging transfers a source pin to the target, retaining the target pin when both are pinned. The usual snapshot precedes migration and exercise merge.


### Lower-trap library coverage (v15)

Migration `v15-lower-traps` adds secondary `lower-traps` associations with frozen keys for the ten existing Face Pull, Y-Raise and Reverse Fly variants. `INSERT OR IGNORE` preserves existing muscle roles and only `source = 'library'` rows qualify; custom, edited/custom-source and unmatched Strong exercises keep their exact muscle rows. Library metadata is read-only today, so there is no separate muscle-edit marker. Rows and pulldowns retain their existing `upper-back` classification. The worker takes its usual pre-migration snapshot. No sets or loads change.

The bundled library and its source mapping carry the same tags for fresh installs. Library version remains 2: existing installations receive this targeted migration without a full re-seed that could refresh unrelated library metadata.

For a terminal-only strength check, run `npx tsx tools/import-report.ts [export folder] --strength "Squat (Barbell)"`. After the normal report, the optional check seeds the bundled library and uses the existing importer in a disposable in-memory database, then prints qualifying known/unknown-effort counts, the starting/personal k, current trend and best session estimate with source sets. The trend is smoothed history, so its source label identifies the latest accepted input rather than attributing the entire trend to one set. Only `tools/import-report.ts` reads export files; nothing is saved.

Migration v16 adds nullable `templateSet.targetRpeHigh` and `exercise.restMaxSeconds` columns. Existing rows retain their values and receive NULL upper bounds. SQLite backups retain both columns, and older backups migrate during restore.


## Automatic progression preferences (T-090, schema v17)

`v17-progression-modes` appends nullable `templateExercise.progressionMode TEXT` checked against
`reps-first`, `weight-first`, `off`. No existing column, session, set, load or target is rewritten. The existing worker
snapshot-before-migration boundary protects this additive migration; old backups migrate in memory
for validation, and full database backups retain the new column.

NULL/omitted now selects Automatic, except a legacy `progression = 'double'` remains Reps first.
Explicit modes take precedence; Off is the only stored disabled preference. Choosing a new preference
clears the legacy field. Save, duplicate, update-from-session and backup/reopen preserve the preference.
Missing targets no longer prevent saving a mode, and no range is invented on save. This supersedes
schema v8's NULL-means-off behavior above.

Suggestions and their resolved default/three-session hold are computed on read, never persisted.
The latest three finished non-deload occurrences in the same saved workout supply evidence; a recorded
manufacturer must match case-insensitively. Missing occurrences, warm-up-only and incomplete sessions
supply none. Latest scoped normal history supplies both grey baseline and suggestion input. Other-workout
history remains a grey fallback only. Off keeps the previous global-baseline behavior. Existing exact
kg storage, entry units, explicit acceptance and completed/entered cell suppression remain unchanged.
