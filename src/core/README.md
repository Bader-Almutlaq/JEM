# core (WorkoutCore)

All the logic of the app: models, database, migrations, import, exercise library, search, logging, analytics and backup. Pure and synchronous, with no React, no DOM types and no worker code. Everything here is tested with `make test`.

## Folders

| Folder | Holds |
|---|---|
| [`models/`](models) | One record type per database table |
| [`db/`](db) | SQLite wrapper, migrations, settings, query cache |
| [`units/`](units) | kg/lb conversion, loadable weights |
| [`import/`](import) | Reading Strong, FitNotes, Fitbod and Hevy exports and writing them |
| [`export/`](export) | CSV export |
| [`library/`](library) | The exercise library, muscles, search and exercise editing |
| [`logging/`](logging) | Writing a workout as it happens, warm-ups, progression, rest timer |
| [`templates/`](templates) | Workout templates and folders |
| [`queries/`](queries) | Read-only queries behind screens |
| [`analytics/`](analytics) | Formulas: e1RM, trend, volume, intensity |
| [`measurements/`](measurements) | Body measurements |
| [`validation/`](validation) | Typo and outlier checks |
| [`backup/`](backup) | Backup files, validation, restore, retention |
| [`support/`](support) | Logging, dates and other shared plumbing |

## Rules

- A concept lives in exactly one file. Check [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) → *Concept ownership* before writing one, and add a row when you add one.
- Tests sit next to the file they test, as `*.test.ts`. Database tests use `Database.openInMemory()` plus `migrate(db)`; never mock the database.
- Every formula cites its source in `reports/Workout tracker app research.md`, or is marked `Heuristic:` with the reason.
- Log through `log.<category>` from `support/log.ts`, never `console`.
