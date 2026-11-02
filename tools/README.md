# tools

Developer scripts, run on the developer's machine through `make` (not shipped in the app).

| Script | Command | Purpose |
|---|---|---|
| `build-library.ts` | `npx tsx tools/build-library.ts` | Builds `src/core/library/library.json` from the pinned sources and `data/sources/library-mapping.json` |
| `build-illustrations.ts` | `npx tsx tools/build-illustrations.ts` | Builds the reviewed exercise-picture mapping |
| `import-report.ts` | `make import-report` | Dry-runs the importer on the owner's real export and prints totals and flagged sets. The only code allowed to read `export_data/` |
| `bench-analytics.ts` | `make bench` | Times analytics calls on a synthetic four-year history |
| `strength-report.ts` | `npx tsx tools/strength-report.ts` | Prints an exercise's strength figures (fitted k, e1RM trend, best session) to check the analytics against real history |
| `render-svg.swift` | `make icon` | Renders the Home Screen icons from `design/app-icon.svg` (macOS) |
