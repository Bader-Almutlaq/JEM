# Import formats: what is known, how sure, and what the parsers do

Written 2026-11-02 for T-096. Sources were public GitHub sources and web search; several hosts (Hevy's help centre, the intervals.icu forum, gist.githubusercontent.com) were unreachable from the cloud session. **Nothing here was checked against a real Hevy, FitNotes or Fitbod export file**, and test fixtures are synthetic. Confidence is marked: **confirmed** (seen in a public sample or source), **reported** (a secondary source says so), **unverified** (our assumption).

## Strong

| Point | Finding | Confidence |
|---|---|---|
| Older layout | Comma-delimited: `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE`; durations like `1h 7m`; timestamps `yyyy-MM-dd HH:mm:ss` local time | confirmed (the owner's export, `docs/DATA.md`), matches a forum listing of the columns |
| Newer layout | Semicolon-delimited, every field quoted: `"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"`, `Weight` written like `100.0`, empty cells `""` | confirmed from a public sample (`aimarchirico/gymruntohevy`, `strong.csv`) |
| Header label can be wrong | Strong exports each exercise in its current unit whatever the header says | confirmed (owner's export) |
| European phones | Semicolons are detected from the header line; decimal commas (`62,5`) are read. Both were already handled | reported; parser test added |
| Unit columns | Some exports carry `Weight Unit` / `Distance Unit` columns. Not seen in any sample we could reach | **unverified**; supported defensively, see below |
| Hevy's import of Strong files | Hevy accepts only Strong CSVs in English | reported |

## Hevy

| Point | Finding | Confidence |
|---|---|---|
| Columns | `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe`; `weight_lbs` and `distance_miles` replace the metric ones when the app is set to imperial | reported (a secondary source also lists a different, older-looking schema: `Date, Workout Name, Exercise Name, Set Order, Weight (kg), Reps, Distance (m), Duration (s), Notes, RPE`, which these parsers do not read) |
| Dates | `26 Oct 2024, 18:00` (day, English month abbreviation, 24-hour time) | reported |
| Set types | `normal`, `warmup`, `dropset`, `failure` | reported |
| Localised exports | Month names or 12-hour times in another language or region would not parse; the importer stops with the column and value rather than guessing | unverified |

## FitNotes

| Point | Finding | Confidence |
|---|---|---|
| Columns | `Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment` (`Weight (lbs)` for imperial) | unverified (consistent with what the parser's author assumed; one converter project confirms only that a `Date` column exists and that rows are sets, reps and weights) |
| Dates | `yyyy-MM-dd`, no time of day: one workout per date, at noon local | unverified |

## Fitbod

| Point | Finding | Confidence |
|---|---|---|
| Columns | `Date,Exercise,Reps,Weight(kg),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier` in that order | confirmed from a public parser (a Go program that reads `WorkoutExport.csv` by position) |
| Dates | `2021-12-27 10:02:51 +0000`: a space, then an offset **without a colon** | confirmed from the same source |
| Warm-ups | `isWarmup` is `true` / `false` | confirmed |
| `multiplier` | Present (the same source parses it and never uses it). Likely 2 for dumbbell exercises, meaning the weight shown is per dumbbell. | unverified. JEM does not apply it: weights stay as exported, so a dumbbell load is per dumbbell. |
| Units | The column is named `Weight(kg)`; whether a pound user gets kilograms or `Weight(lb)` is unverified. Both header spellings are accepted | unverified |

## What this audit changed

1. **Timestamp offsets without a colon.** Fitbod writes `+0000`. Safari's `Date.parse` rejects an ISO offset without a colon, and the app runs in Safari, so a real Fitbod import could have failed on the phone while passing in Node. `parseWorkoutTimestamp` now rewrites `±HHMM` to `±HH:MM` before parsing. Tests cover `+0000`, `-0530` and `+01:00`.
2. **Grouped numbers.** Every adapter turned a comma into a point, so a quoted `"1,000"` would have been stored as `1` (a silent 1000 times error). One reader, `readExportNumber`, now serves all four parsers: it accepts `61,23`, `1,234.5` and `1.234,5`, and **refuses** a lone `1,234` (thousands or three decimals) so the owner is told which cell to fix.
3. **Strong unit columns.** `Weight Unit` (`kg`, `kgs`, `lb`, `lbs`, kilograms, pounds) sets each row's unit instead of the per-exercise guess; a blank cell falls back to the guess; an unknown label stops the import with its line. `Distance Unit` (`m`, `km`, `mi`) converts distance to meters; blank means meters. FitNotes shares the same distance-unit reader.
4. Synthetic fixtures were added for a continental semicolon file with units, a Fitbod file with offsets and a Hevy kilogram file. None uses the owner's export.

## Still open

- Strong's older layout has one `Distance` column with no unit label; the parser reads it as meters. If a real older export shows kilometres or miles there, distances would be off by 1000 or 1609. Check against a run in the owner's own export (header and one cardio row; never commit it).
- Get one real export from each of Hevy, FitNotes and Fitbod from a friend and compare the headers with this table (a header-only file is enough; never commit it).
- Fitbod users on pounds: if their file is kilograms converted from pounds, the imported sets show kilogram values such as 20.41 kg instead of 45 lb. Entry-unit inference (as Strong uses) could restore the pound display; not done without a real file to test against.
- Localised Hevy dates (see above).
