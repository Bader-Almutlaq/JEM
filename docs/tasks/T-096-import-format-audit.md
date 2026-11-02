# T-096: Audit the importers against real export formats

- **Milestone:** Import · **Depends on:** T-049, T-051 · **Model tier:** high

## Goal

Compare the Strong, Hevy, FitNotes and Fitbod parsers with what the apps really write, and fix gaps that could lose or misread data: continental Strong files (semicolons, decimal commas), Strong unit columns, Hevy's date formats and kg/lb columns, Fitbod's `multiplier` and timestamps. Fixtures stay synthetic; `export_data/` is never read.

## Acceptance

- `docs/research/import-formats.md` states each format's columns, dates and units with a confidence level.
- Every gap found is fixed with a regression test, or listed in the research file as open.
- `make verify` passes.

## Handoff

Done (lead). The research is `docs/research/import-formats.md` (written by the owner's local session, with confidence per claim). The parsers were then checked against it. Changes: colon-less timestamp offsets (Safari), `readExportNumber` (ambiguous grouped numbers refused), Strong `Weight Unit` / `Distance Unit`, shared `metersPerDistanceUnit` and `readWeightUnit`.

Open: no real Hevy, FitNotes or Fitbod file has been seen; the research file lists what a friend's header-only export would confirm. Fitbod's `multiplier` is still deliberately not applied.

### First pass (before the research file was merged)

1. **Timestamp offsets without a colon.** Fitbod writes `+0000`. Safari's `Date.parse` rejects an ISO offset without a colon, and the app runs in Safari, so a real Fitbod import could have failed on the phone while passing in Node. `parseWorkoutTimestamp` now rewrites `±HHMM` to `±HH:MM` before parsing. Tests cover `+0000`, `-0530` and `+01:00`.
2. **Grouped numbers.** Every adapter turned a comma into a point, so a quoted `"1,000"` would have been stored as `1` (a silent 1000 times error). One reader, `readExportNumber`, now serves all four parsers: it accepts `61,23`, `1,234.5` and `1.234,5`, and **refuses** a lone `1,234` (thousands or three decimals) so the owner is told which cell to fix.
3. **Strong unit columns.** `Weight Unit` (`kg`, `kgs`, `lb`, `lbs`, kilograms, pounds) sets each row's unit instead of the per-exercise guess; a blank cell falls back to the guess; an unknown label stops the import with its line. `Distance Unit` (`m`, `km`, `mi`) converts distance to meters; blank means meters. FitNotes shares the same distance-unit reader.
4. Synthetic fixtures were added for a continental semicolon file with units, a Fitbod file with offsets and a Hevy kilogram file. None uses the owner's export.
