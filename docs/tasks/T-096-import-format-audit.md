# T-096: Audit the importers against real export formats

- **Milestone:** Import · **Depends on:** T-049, T-051 · **Model tier:** high

## Goal

Compare the Strong, Hevy, FitNotes and Fitbod parsers with what the apps really write, and fix gaps that could lose or misread data: continental Strong files (semicolons, decimal commas), Strong unit columns, Hevy's date formats and kg/lb columns, Fitbod's `multiplier` and timestamps. Fixtures stay synthetic; `export_data/` is never read.

## Acceptance

- `docs/research/import-formats.md` states each format's columns, dates and units with a confidence level.
- Every gap found is fixed with a regression test, or listed in the research file as open.
- `make verify` passes.

## Handoff

Done (lead). Findings and changes are in `docs/research/import-formats.md` → *What this audit changed*: colon-less timestamp offsets (Safari), `readExportNumber` (ambiguous grouped numbers refused), Strong `Weight Unit` / `Distance Unit`, shared `metersPerDistanceUnit` and `readWeightUnit`.

Open: no real Hevy, FitNotes or Fitbod file has been seen; the research file lists what a friend's header-only export would confirm. Fitbod's `multiplier` is still deliberately not applied.
