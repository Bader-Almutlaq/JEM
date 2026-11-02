# formats

Adapters for workout exports other than Strong's own: FitNotes, Fitbod and Hevy. Each adapter turns its CSV into the same `StrongRow` shape so the rest of the import flow is shared.

`WorkoutFileTable` (column lookup and weight, distance and time readers), `WorkoutFileUnits`, `metersPerDistanceUnit`, `readWeightUnit` and `parseWorkoutTimestamp` are the shared pieces. Add new column or unit handling there, not in each adapter. `detectWorkoutFileFormat` picks the adapter from the header. Format notes are in [`docs/research/import-formats.md`](../../../../docs/research/import-formats.md).
