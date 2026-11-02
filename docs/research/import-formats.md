# Import formats: Hevy, Strong, FitNotes, Fitbod and others

Researched 2026-11-02. Purpose: check our CSV parsers against the real export files.

**Read this first.** None of these apps publishes a column specification. Their help pages say only where the export button is. Everything below was read from (a) literal export files that other people committed to public repositories, and (b) the parsers other projects wrote against real exports. Each claim carries a confidence:

- **High**: seen in a literal export file, or in two or more independent sources that agree.
- **Medium**: one source, or parser code written by someone who says they tested against real files.
- **Low**: inferred, or only seen in a converter that writes the format (not reads it).

Sample rows are **synthetic** (values invented, format kept). Source links are GitHub paths; "literal file" means a real export, not a fixture written by hand.

General rules that held in every real file seen: UTF-8, one row per set, a header row, RFC 4180 quoting (commas, quotes and line breaks inside notes are quoted), decimal point (never decimal comma), and local wall-clock time without a time zone (Fitbod is the exception).

---

## 1. Hevy

Export path: Profile -> Settings -> Export & Import Data -> export workouts or measurements ([Hevy help, 38001424401943](https://help.hevyapp.com/hc/en-us/articles/38001424401943), seen only as a search snippet, the page returned 403 to the fetch; also listed in [openGym DATA_IMPORTS.md](https://github.com/DuarteSantos8/openGym/blob/main/docs/DATA_IMPORTS.md)). Confidence: medium.

### Workouts file (`workout_data.csv`)

Kilogram users (literal file, 14 columns, every name quoted):

```
"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
```

Pound users get the same header with `weight_lbs` instead of `weight_kg` and `distance_miles` instead of `distance_km`:

```
"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles","duration_seconds","rpe"
```

Synthetic rows (kg):

```
"Push A","28 Oct 2026, 18:04","28 Oct 2026, 19:06","Slept badly","Bench Press (Barbell)",,"Pause the first rep",0,"warmup",40,8,,,
"Push A","28 Oct 2026, 18:04","28 Oct 2026, 19:06","Slept badly","Bench Press (Barbell)",,"Pause the first rep",1,"normal",80,5,,,8
"Morning run","29 Oct 2026, 07:30","29 Oct 2026, 08:02","","Running",,"",0,"normal",,,5.21,1860,
```

Rules:

| Item | Rule | Confidence |
|---|---|---|
| Column order | Exactly the 14 above, unchanged between a Nov 2024 export and an Oct 2026 export. No newer columns found for 2024-2026. | High |
| Unit by header | Weight and distance column names follow the user's unit setting: `weight_kg`/`weight_lbs`, `distance_km`/`distance_miles`. Only one of each pair appears in a file. One third-party doc says a file has both columns; no literal file shows that, so parse by name and accept either. | High (names), Low (both-columns claim) |
| Date format | `D Mon YYYY, HH:mm`, e.g. `28 Oct 2026, 07:10`. The real files seen (26 Nov 2024, 28 Oct 2026) only had two-digit days, so whether single-digit days are padded (`05` or `5`) is unobserved: accept 1 or 2 digits. 24-hour clock, minute precision, no seconds, no time zone (local wall clock). Month names are abbreviated and follow the app language, so non-English exports have localized months (Hevy asks for English for its own import). | High (format), Medium (localization, single-digit day) |
| Row model | One row per set. `title`, `start_time`, `end_time`, `description` repeat on every row. A workout is the triple (title, start_time, end_time). | High |
| Order | Newest workout first, then exercises in order, sets by `set_index`. | Medium |
| `set_index` | 0-based, restarts for each exercise. If an exercise appears twice in a workout, the index restarts and it is a separate occurrence. | High |
| `set_type` | `normal`, `warmup`, `dropset`, `failure`. Real files seen only contained `normal` and `warmup`; `dropset` and `failure` come from Hevy's public API enums and three independent parsers. Not `drop_set`: that spelling appears only in one hand-written test fixture. | Medium |
| `superset_id` | Empty, or an integer shared by the exercises in a superset. | Medium |
| `exercise_notes` | Per-exercise note, repeated on each set row. Can contain line breaks. | High |
| `description` | Workout-level note, repeated on each row. | High |
| `rpe` | Empty or a decimal (7.5, 8). | Medium |
| `distance_km` / `distance_miles` | Decimal, in the unit named. Empty for strength. | Medium |
| `duration_seconds` | Integer seconds. Empty for strength. | Medium |
| Cardio rows | `weight`/`reps` empty, `distance` and `duration_seconds` filled. Timed holds (plank) fill `duration_seconds` only. | Medium |
| File | UTF-8, no BOM, CRLF line ends, no newline after the last row, strings always quoted, numbers bare. | High (one real file) |
| Empty cells | Empty numbers are bare empty (`,,`), empty strings are `""`. | High |

Sources: literal files and notes in [muskli HEVY-IMPORT.md](https://github.com/T0liver/muskli/blob/HEAD/docs/HEVY-IMPORT.md) (an Oct 2026 export), the pandas dump of a Nov 2024 export in [mauricekoreman/hevy_data_import](https://github.com/mauricekoreman/hevy_data_import/blob/HEAD/script.ipynb), the empty-file header constant in [LiftShift constants.ts](https://github.com/aree6/LiftShift/blob/HEAD/frontend/constants.ts), the lbs variant in [betterr_me hevy-csv.ts](https://github.com/xtan9/betterr_me/blob/HEAD/lib/fitness/hevy-csv.ts) and [Kinoku import format](https://kinoku.app/import-format), the set types in [Haltera IMPORT-FORMATS.md](https://github.com/Sebas1705/Haltera/blob/HEAD/docs/IMPORT-FORMATS.md).

### Measurements file (`measurement_data.csv`)

Literal header, 17 columns, quoted, same date format (date-only entries show `00:00`):

```
"date","weight_kg","fat_percent","neck_cm","shoulder_cm","chest_cm","left_bicep_cm","right_bicep_cm","left_forearm_cm","right_forearm_cm","abdomen_cm","waist_cm","hips_cm","left_thigh_cm","right_thigh_cm","left_calf_cm","right_calf_cm"
```

Synthetic rows:

```
"1 Mar 2026, 08:30",80.4,18.5,,,,,,,,,,,,,,
"05 Mar 2026, 00:00",,,,,,,,,,,88,,,,,
```

- One row per entry; unfilled measures are empty. Whether pound/inch users get `weight_lbs` or `*_in` headers is **not observed** (only one kg/cm file was seen). Detect the file by `date` + `weight_kg`/`weight_lbs` and no `exercise_title`. Confidence: High (header, one real file), Low (unit variants).
- Source: [muskli HEVY-IMPORT.md](https://github.com/T0liver/muskli/blob/HEAD/docs/HEVY-IMPORT.md).

### Hevy's own import format (not an export, for reference)

Hevy imports only the Strong layout (section 2), in English, and treats `Weight` as kilograms ([smyrick STRONG_FORMAT.md](https://github.com/smyrick/sugarwod-to-hevy/blob/HEAD/docs/STRONG_FORMAT.md)). Confidence: medium.

---

## 2. Strong

Export path: iOS Settings -> Export Strong Data; Android Settings -> Export Data. Output is a CSV; Strong cannot re-import it ([Strong help 235](https://help.strongapp.io/article/235-export-workout-data), fetched). Confidence: High.

Strong has shipped at least three shapes. Detect by header names, and pick the delimiter from the header line (count `;` vs `,`).

### 2a. iOS / "current" comma export (12 columns)

```
Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
```

Synthetic rows (this is how the real file quotes: workout and exercise names always quoted; empty Notes/Workout Notes written as `""` on the first row of a workout and bare after that; weight with one decimal; unused Distance/Seconds written `0`):

```
2026-03-02 18:04:11,"Push Day",1h 3m,"Bench Press (Barbell)",1,80.0,5,0,0,"","",
2026-03-02 18:04:11,"Push Day",1h 3m,"Bench Press (Barbell)",2,80.0,5,0,0,,,8
2026-03-02 18:04:11,"Push Day",1h 3m,"Plank",1,0,0,0,60,,,
```

| Item | Rule | Confidence |
|---|---|---|
| Header | As above. Identical in a literal Dec 2020 to Sep 2021 export (1,903 rows) and quoted by users in 2021 and by recent parsers. | High |
| Date | `YYYY-MM-DD HH:MM:SS`, 24-hour, local wall clock, no zone. It is the workout start and repeats on every row. | High |
| Duration | Elapsed time as text tokens: `45m`, `1h 3m`, `2h 38m`, `2h` (no minutes when zero), `5m`, `1m`. Never `HH:MM:SS`. Repeats on every row. | High |
| Weight | Number with no unit. The unit is whatever the user set in Strong; the file does not say. One decimal (`40.0`). `0` for bodyweight, cardio and timed sets. | High |
| Reps, Distance, Seconds | Reps integer. `Seconds` is set duration (plank, cardio), not rest. Unused fields are `0`. `Distance` has no unit in this layout (the literal file's one swim row shows `1.0` with `Seconds` 30; other parsers disagree on whether it is km, miles or metres): treat as unknown, ask or assume the user's distance unit. | High (Seconds), Low (Distance unit) |
| Set Order | In the literal 2020-21 file: `1..N`, restarting at 1 for each exercise. Marker values in later files: `W` warm-up, `D` drop set, `F` failure, and rows with `Rest Timer` or `Note` (see 2c). Those markers are confirmed in a literal 2026 Android file (W, Rest Timer, Note) and in Ryot's parser (W, F, D, Rest Timer, Note); `D` and `F` were not seen in any literal file. | High (W, Rest Timer, Note), Medium (D, F) |
| RPE | Blank unless the user logged it. Value is a number. | Medium |
| Notes | Exercise-level note text. | Medium |
| Workout Notes | Repeats on every row of the workout. | Medium |
| Encoding | The literal file has no BOM and is comma-delimited with LF or CRLF line ends. | Medium |

Sources: literal file [StrongAppAnalytics strong.csv](https://github.com/AlexandrosKyriakakis/StrongAppAnalytics/blob/HEAD/Data/strong.csv) (analysed in full), header posted in [intervals.icu forum thread, 14 Dec 2021](https://forum.intervals.icu/t/import-strong-data-weightlifting-app/5531), reference doc [smyrick STRONG_FORMAT.md](https://github.com/smyrick/sugarwod-to-hevy/blob/HEAD/docs/STRONG_FORMAT.md), [Ryot strong-app importer](https://github.com/IgnisDa/ryot/blob/HEAD/crates/services/importer/strong-app/src/lib.rs) (calls the delimiter `,` on iOS), [dugcanlift WorkoutCSV.swift](https://github.com/dougray/dugcanlift-lift-ios/blob/HEAD/Sources/App/WorkoutCSV.swift) (its fixtures are rebuilt from published shapes, not copied).

### 2b. Android semicolon export (13 columns, 2026, literal file)

```
"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"
```

Synthetic rows (every field quoted, delimiter `;`):

```
"41";"2026-03-02 18:04:11";"Upper A";"3725";"Bench Press (Barbell)";"Note";"";"";"";"";"";"Pause the first rep";"Slept badly"
"41";"2026-03-02 18:04:11";"Upper A";"3725";"Bench Press (Barbell)";"W";"40.0";"8";"";"";"";"";"Slept badly"
"41";"2026-03-02 18:04:11";"Upper A";"3725";"Bench Press (Barbell)";"1";"80.0";"5";"";"";"";"";"Slept badly"
"41";"2026-03-02 18:04:11";"Upper A";"3725";"Bench Press (Barbell)";"Rest Timer";"";"";"";"";"120.0";"";"Slept badly"
```

| Item | Rule | Confidence |
|---|---|---|
| Delimiter | `;`, all fields quoted. This follows the platform (Android), not the phone's locale: the literal 2026 file uses a decimal point (`35.0`). No export with decimal commas was found. A parser should still tolerate a decimal comma defensively. | High (`;` on Android), Low (anything about European locales) |
| `Workout #` | Integer id of the workout (1..N). Use it to group sessions. Older docs call it `Workout No`. | Medium |
| `Duration (sec)` | Integer seconds (`3725`). Different from the iOS `1h 3m` text. | High |
| `Weight (kg)` | Always kilograms; the unit is in the header. | High |
| `Distance (meters)` | Metres. | Medium |
| Marker rows | `Set Order` = `Note`: no weight/reps, the exercise note is in `Notes`. `Set Order` = `Rest Timer`: rest in `Seconds` (`120.0`), not a set. Both must be skipped as sets. | High |
| `W` | Warm-up set (weight/reps filled). Working sets are numbered `1..N` and keep counting across interleaved Rest Timer rows. | High |
| Sizes | The literal file had 2,053 rows for 52 workouts, 854 of them Rest Timer rows. | High |

Sources: literal file [Bybon strong-backup-sample.csv](https://github.com/LordRaydenMK/Bybon/blob/HEAD/app/src/test/resources/strong-backup-sample.csv) with analysis in [Bybon strong-import.md](https://github.com/LordRaydenMK/Bybon/blob/HEAD/docs/strong-import.md), [Kinoku import format](https://kinoku.app/import-format) (calls it Strong 6.2.4, same column order), [Ryot importer](https://github.com/IgnisDa/ryot/blob/HEAD/crates/services/importer/strong-app/src/lib.rs) (aliases `Duration (sec)`, `Weight (kg)`, `Distance (m)`).

### 2c. Older layouts (lower confidence, no literal Strong-written file found)

Comma, with the workout duration last (Kinoku calls it the older export; no unit column):

```
Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE,Workout Duration
```

Semicolon, with unit columns. This is the template Hevy documents for its import, and several converters write it; it also matches an older Strong export that [strong-charts](https://github.com/sitek94/strong-charts/blob/HEAD/src/lib/types.ts) reads:

```
Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration
```

Example values from a converter: `Weight Unit` = `kg`/`lbs`, `Distance Unit` = `km`, `Workout Duration` = `50m` or `56s`, `Date` = `2013-01-03 13:54:52` ([hevy_data_import notebook](https://github.com/mauricekoreman/hevy_data_import/blob/HEAD/script.ipynb), [Jefit2Strong](https://github.com/PeFerreira98/Jefit2Strong.csv.converter/blob/HEAD/converter.py)). Another parser claims a "2024+" semicolon layout ending in `Weight Unit` ([LiftTrace strong.js](https://github.com/TraceApps/lifttrace/blob/HEAD/server/lib/workout-import/strong.js)); this contradicts the literal 2026 Android file and is **unverified**.

Confidence for 2c: Medium (names exist), Low (which Strong version wrote them).

### 2d. Set-type encoding in `Set Order` (all layouts)

| Value | Meaning | Confidence |
|---|---|---|
| `1`, `2`, ... | Working set, numbered per exercise | High |
| `W` | Warm-up | High |
| `D` | Drop set | Medium (code in Ryot, dugcanlift, Haltera; no literal row seen) |
| `F` | To failure | Medium (same) |
| `Rest Timer` | Rest row, duration in `Seconds`; skip | High (Android); Medium (iOS, per Ryot) |
| `Note` | Exercise note row; skip | High (Android); Medium (iOS) |

### 2e. Measurements export

Strong writes a separate file per measure. Columns reported: `Date`, `Measurement Type`, `Value`, `Unit`, and a `Source` column; dates as `YYYY-MM-DD HH:MM:SS`. Measurement types include `Weight`, `Body Fat Percentage`, and body parts. Only the column names `Measurement Type` and `Value` are confirmed by a parser written against a real export ([openGym import-csv.js](https://github.com/DuarteSantos8/openGym/blob/HEAD/frontend/src/lib/import-csv.js), [openGym DATA_IMPORTS.md](https://github.com/DuarteSantos8/openGym/blob/main/docs/DATA_IMPORTS.md)); the full header and `Source` come from a tool that writes Strong-style files ([mikon export.ts](https://github.com/Advik-Gupta/mikon/blob/HEAD/src/lib/import/export.ts)). Confidence: Low-Medium. No literal measurements file found.

---

## 3. FitNotes

Android path: Settings -> Spreadsheet Export -> Workout Data (CSV). iOS ("FitNotes 2" by a different developer) has "Export workouts as CSV" ([openGym DATA_IMPORTS.md](https://github.com/DuarteSantos8/openGym/blob/main/docs/DATA_IMPORTS.md)). Confidence: medium.

### 3a. Android, current (literal 2026 file)

```
Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment
```

Synthetic rows:

```
2026-04-29,Bench Press,Chest,80,kgs,5,,,,
2026-04-30,Preacher Curl,Arms,32.5,kgs,10,,,,"slow, controlled"
2026-05-02,Treadmill,Cardio,,,,5,km,30:00,
```

### 3b. Android, older

```
Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment
```

Pound users get `Weight (lbs)` in the same position.

| Item | Rule | Confidence |
|---|---|---|
| Header variants | 3a (since about v25), 3b (earlier). Match by name: the weight column is `Weight (kgs)`, `Weight (lbs)`, or `Weight` with a `Weight Unit` column. A claim that Android writes both `Weight (kgs)` and `Weight (lbs)` columns is not backed by any literal file (that is the iOS layout). | High (3a literal file; 3b in two independent sources) |
| Date | `YYYY-MM-DD`, date only, no time, no zone. One row per set, grouped by date. Two sessions on one day cannot be told apart. One parser reports locale-dependent dates in some exports; no literal example found, so treat non-ISO dates as an error and report them. | High (ISO), Low (locale dates) |
| Weight | Number, no trailing `.0` in the literal file (`20`, `32.5`). Empty for time/distance rows. | High |
| Weight unit | `kgs` in all 108 rows of the literal file. `lbs` is the other value. Unit is per row, so one file can mix units (per-exercise unit is a paid feature). Normalise `kg/kgs/lb/lbs`. | High (`kgs`), Medium (`lbs`) |
| Reps | Integer; empty for cardio and timed rows. | High |
| Distance, Distance Unit | Number plus unit text. Valid units per the iOS importer docs: `m`, `km`, `cm`, `in`, `ft`, `yd`, `mi`. | Medium |
| Time | Cardio and timed duration. Official iOS importer says `HH:MM:ss`, with `MM:ss` also accepted; the literal Android file had no timed rows, so the Android emission format is **unverified**. Accept `H:MM:SS`, `HH:MM:SS`, `MM:SS`, and plain seconds. | Low |
| Category | Muscle group text, localised (a Hebrew export has Hebrew categories). `Cardio` marks cardio. Do not branch on it except as a hint. | High |
| Comment | Per-set comment, quoted if it contains commas. No workout-level notes. | High |
| Not exported | Workout name, duration, set order, RPE, supersets, warm-up flag, per-set time. | High |

### 3c. FitNotes 2 (iOS) import/export layout (official import spec)

```
Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind
```

Date `YYYY-mm-dd` (ascending), exactly one of the two weight columns filled per row, `Time` as `HH:MM:ss`, `Kind` = letters `w`, `r`, `d`, `t` for the metrics used (for example `wr` weight and reps, `dt` distance and time). Source: [FitNotes 2 migrate docs](https://www.getfitnotes.com/docs/migrate-from-other-apps.html) (fetched). Confidence: High that this is what the importer accepts; Medium that the iOS exporter writes the same.

Sources: literal file [LOGBOOK FitNotes export](https://github.com/Hypertrophus/LOGBOOK) (`To Export/FitNotes_Export_TEST - FitNotes_Export_2026_05_13_14_26_07.csv`; header and `kgs` verified by reading the file), older headers in the [kenprice gist](https://gist.github.com/kenprice/d9a4c1c2cba5a7ae5465cce8ce8ad48f), [pumpR import.R](https://github.com/magnusnissel/pumpR/blob/HEAD/import.R), [LiftTrace fitnotes.js](https://github.com/TraceApps/lifttrace/blob/HEAD/server/lib/workout-import/fitnotes.js), [Kinoku import format](https://kinoku.app/import-format) and [Haltera IMPORT-FORMATS.md](https://github.com/Sebas1705/Haltera/blob/HEAD/docs/IMPORT-FORMATS.md).

---

## 4. Fitbod

Export path: Log tab -> gear icon -> Export Workout Data on iOS; the file is `WorkoutExport.csv`. Android has no in-app export: support emails a database extract with a different header (see below) ([Gript Fitbod help](https://griptapp.com/help/import-from-fitbod), [fitbod-to-hevy-converter README](https://github.com/kaitlinnewson/fitbod-to-hevy-converter)). Confidence: Medium.

### iOS export (11 columns)

```
Date,Exercise,Reps,Weight(kg),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier
```

Synthetic rows. Note the leading space Fitbod writes before some numbers; trim every field:

```
2026-10-24 18:24:59 +0000,Barbell Incline Bench Press, 10,20.0,0.0,0.0,0.0,0.0,true,, 1.0
2026-10-24 18:24:59 +0000,Barbell Incline Bench Press, 8,60.0,0.0,0.0,0.0,0.0,false,"felt heavy, stop at 8", 1.0
2026-10-24 18:24:59 +0000,Dumbbell Curl, 12,12.5,0.0,0.0,0.0,0.0,false,, 2.0
```

| Item | Rule | Confidence |
|---|---|---|
| Header | Exactly the 11 names above. Same header in six independent projects. | High |
| Date | `YYYY-MM-DD HH:mm:ss +0000` (offset written as `+HHMM`). One timestamp per workout: every set of a workout carries the same value. There is no workout name and no end time, so group rows by timestamp. | High (format), Medium (one timestamp per workout) |
| Units | Header names the units: kg, seconds, metres. Weight is `Weight(kg)`. One source claims the file follows the user's lb/kg setting; the header and three parsers say kg, so treat as kg. | Medium |
| `Reps`, `Duration(s)`, `Distance(m)`, `Incline`, `Resistance` | Numbers, often with a decimal (`0.0`). Cardio rows use duration and distance. `Incline` and `Resistance` carry no unit in the header. | Medium |
| `isWarmup` | Lowercase text `true` or `false`. | High |
| `Note` | Free text, quoted when it contains a comma. | Medium |
| `multiplier` | A volume factor for the weight shown. Reported values: `2` for a pair of dumbbells (weight is per dumbbell), `1` for one implement, `0` for cardio/assisted. The converter that documents it says the value is not applied when moving to Hevy. For volume, multiply weight x reps x multiplier only if you want per-pair volume. | Low-Medium (documented by one converter and used by one dashboard script) |
| Padding | Some numeric fields start with a space. | High |
| Other | Blank lines and a BOM may appear. | Medium |

### Support (Android) export

Header (lowercase in places, fewer columns, date only, no time of day):

```
date,exercise_name,Reps,weight_kg,duration_seconds,distance_meters,Incline,Resistance,isWarmup
```

Dates look like `2025-06-23`. Weights rounded to 0.01 kg, distances to 0.1 m because of unit conversion. Confidence: Medium (one source).

Sources: header and quirks in [fitbod-to-hevy-converter README](https://github.com/kaitlinnewson/fitbod-to-hevy-converter) and its [spec file](https://github.com/sinan92/fitbod-to-hevy-converter/blob/HEAD/src/app/converter/fitbod-csv.spec.ts), parser comment block in [SBL-App FitbodCSVParser.swift](https://github.com/AviRamoutar/SBL-App/blob/HEAD/SBL/Services/Import/FitbodCSVParser.swift), column positions and date layout in the [Mikulas gist](https://gist.github.com/Mikulas/155b1fa36b3aab10cd0857f281ae85ca), column list in [fitbod-report README](https://github.com/rhnfzl/fitbod-report), `multiplier` use in [jacoppock fitbod-to-json.mjs](https://github.com/jacoppock/jacoppock.dev/blob/HEAD/scripts/fitbod-to-json.mjs). No literal export file was found, so sample rows are modelled on the converter's test row.

---

## 5. Other apps (brief)

| App | Format | Literal header or sample found? | Source and confidence |
|---|---|---|---|
| StrongLifts | CSV, one row per exercise with sets spread across columns. Date `YYYY/MM/DD`. Unit in the header (`KG` or `LB`). File starts with a BOM. | Yes: `Date (yyyy/mm/dd),Workout,Workout Name,Program Name,Body Weight (KG),Exercise,Sets×Reps,Sets×Time,Top Set (Reps×KG),e1RM (KG),Reps,Volume (KG),Workout Volume (KG),Duration (hours),Start Time (h:mm),End Time (h:mm),Notes,Set 1 (Reps),Set 1 (KG),Set 2 (Reps),Set 2 (KG),...,Set 6 (KG)`. Times are 12-hour (`10:56 PM`). A 0 in a `Set N (Reps)` column means an unused or failed slot. | [LiftLog test file](https://github.com/LiamMorrow/LiftLog/blob/HEAD/tests/csv-import-test-files/stronglifts-export-kg.csv) and [CsvImport.md](https://github.com/LiamMorrow/LiftLog/blob/HEAD/docs/CsvImport.md). Medium (one file, KG variant). Official page says only "CSV document" ([support.stronglifts.com/article/131-export](https://support.stronglifts.com/article/131-export)). |
| Jefit | Not a flat CSV. One text file split into sections, each starting with a line like `### EXERCISE LOGS ##########`, ending with a line of `#`, with blank-line separated blocks and a header row per block. Units in the `SETTING` section (`mass` is ` kg` or ` lb`). Sets are packed in one cell, e.g. `"40x8,40x8,40x5"`. `starttime`/`endtime` in unix seconds. | Section and column names only; no sample rows. | [n-gym jefit-export-format.md](https://github.com/NicolaiGoon/n-gym/blob/HEAD/docs/jefit-export-format.md) (notes from a real Oct 2026 export). Medium. |
| Alpha Progression | Semicolon text with section blocks, not a table: a workout line like `"Day 1 · Week 1 · Plan";"2026-07-07 12:58 pm";"38 sec"`, an exercise line like `"1. Leg Extensions · Machine · 10 reps"`, then a set table headed `#;LB;REPS` (the unit token is `LB` or `KG`). Timestamp `YYYY-MM-DD HH:MM am/pm`. | Shapes only, from parser comments; no literal file. | [stratum parser](https://github.com/shippopotamuslabs/stratum/blob/HEAD/functions/src/import/deterministic/alphaProgressionParser.ts), [ryft-app format](https://github.com/timkrebs/ryft-app/blob/HEAD/Ryft/Train/Import/Formats/AlphaProgressionFormat.swift). Low-Medium. |
| Boostcamp, Liftin' | No literal header or sample row found. | No | Not found. |
| Gravl | Export path only (Profile -> Export Data). | No | [openGym DATA_IMPORTS.md](https://github.com/DuarteSantos8/openGym/blob/main/docs/DATA_IMPORTS.md). |

---

## Parser checklist

- Detect by header names, not position; pick the delimiter (`,` or `;`) from the first line; strip a BOM; accept CRLF and LF.
- Hevy: unit comes from the header name. Dates `D Mon YYYY, HH:mm`, English months only unless you add locales. Group by (title, start_time, end_time). `set_type` in {normal, warmup, dropset, failure}.
- Strong: weight has no unit in the comma layouts, so the user must say kg or lb; the Android layout is always kg. Skip `Rest Timer` and `Note` rows. `Set Order` letters `W`, `D`, `F`. Duration is text (`1h 3m`) on iOS and integer seconds on Android. Never assume a decimal comma.
- FitNotes: unit is per row (`Weight Unit`) or in the header (`Weight (kgs)`); date only, so one workout per day; no set order beyond file order.
- Fitbod: trim every field; `isWarmup` is `true`/`false`; one timestamp per workout; weights in kg; `multiplier` is not a rep count.
