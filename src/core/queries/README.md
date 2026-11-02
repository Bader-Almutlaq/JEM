# queries

Read-only queries behind the screens: history, workout detail, exercise catalog and progress, personal bests, comparisons, the live workout, template statistics, muscle and intensity summaries, weekly totals.

- Queries return plain data and never write.
- Expensive reads go through `Database.cache`. Whole-screen results follow the global data version; per-exercise results (`ExerciseSessions`, `ExerciseSeries`, `ExerciseCurve` …) survive writes to other lifts.
- `ExerciseSessions` is the one SQL read of an exercise's finished sessions; build on it rather than re-querying.
- Calculations belong in `../analytics`; queries gather the rows and call them.
