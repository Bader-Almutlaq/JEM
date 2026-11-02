# import

Reads workout exports and writes them into the database. The flow is *parse → plan → review → write*: nothing is written until the owner has seen the plan, and the worker takes a snapshot first.

- `CsvTable`, `parseDecimal`, `readExportNumber`, `trimWhitespace`: CSV and number reading. Use `readExportNumber` for numbers in export files; it refuses ambiguous values such as `1,234` instead of guessing.
- `StrongWorkoutsFile`, `StrongMeasurementsFile`, `StrongTimestamp`, `StrongRow`: the Strong formats.
- [`formats/`](formats): the FitNotes, Fitbod and Hevy adapters and format detection.
- `ExportUnitResolver`: decides which unit an exported exercise was recorded in.
- `StrongImportPlan`, `StrongImportOptions`, `StrongImporter`: the reviewable plan, the owner's choices, and the transactional write.

The owner's real export lives in `export_data/` (git-ignored). Tests use small synthetic fixtures only.
