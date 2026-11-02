# models

One record type per database table (`Workout`, `WorkoutSet`, `Exercise`, `Template` …), plus the small enums stored in columns (`SetKind`, `SetSide`, `RecordSource`) and the `from<Type>Row` converters that turn SQLite rows (0/1 flags) into typed objects.

Models hold data only. Behaviour belongs in the folder that owns the concept.
