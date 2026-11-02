# db

The only code that talks to SQLite.

- `Database` wraps the SQLite connection: queries, transactions, export and import of the database bytes, the data version and the bounded per-connection result cache (`QueryCache`).
- `migrations.ts` is the schema, **append-only**. Never edit a migration that has shipped; add a new one. Reference data such as muscle rows is written out inside the migration, frozen.
- `AppSetting` lists every key in the key–value settings table.
- `ExerciseChanges` tracks which exercises a write touched so cached per-exercise results survive unrelated writes.

The worker takes a safety snapshot before running pending migrations. See [`docs/DATA.md`](../../../docs/DATA.md).
