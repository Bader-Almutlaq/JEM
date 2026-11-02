# T-097: Data-safety re-audit after Dropbox, edit-past-workouts and the per-lift cache

- **Milestone:** Data safety · **Depends on:** T-037, T-038, T-042, T-050, T-094, T-095 · **Model tier:** high

## Goal

Re-check backup, restore, migrations, deletes, merges, imports and the per-lift cache change tracking (`src/core/db/ExerciseChanges.ts`) for data loss, misread data and wrong calculations, now that cloud backup, restore from Dropbox, import adapters and cached lifts exist. Fix confirmed findings with a regression test.

## Handoff

Done (lead). Method: read the code paths, compared them with the T-037 and T-038 verdicts, and ran an extended randomized check. **No new data-loss defect was found in these areas.** The import defects found are in T-096. Verdicts:

| Area | Verdict | Evidence |
|---|---|---|
| Per-lift cache (`ExerciseChanges`, `QueryCache`, `Database.run/exec/transaction`) | Safe | Read the trigger set against every table the cached per-lift queries read (`ExerciseSessions`, `ExerciseCurve`, `ExerciseStrength`, `ExerciseSeries`, `LiftTrends`, `HistoryBoundary`): none reads `appSetting`, `bodyMeasurement`, pins or templates except the folder-scoped `LiftTrends` path, which bypasses the cache on purpose. The existing seeded test (60 steps) was re-run at 400 steps over five other seeds (2,000 random writes: sets, entry moves, workout dates, equipment, muscle roles, rollbacks, settings): every cached result equalled a fresh connection. The extra seeds were run once and not committed. |
| Restore from Dropbox (new) | Safe | Downloaded bytes go through the one worker `restoreBackup` (validate, safety snapshot, replace, roll back). Refused list paths, failed downloads and `BackupError` messages are tested; a failure never reports success. |
| Backup and migrations | Safe (T-037 verdict stands) | Nothing changed since; migrations still snapshot first. |
| Deletes | Safe by design | `finish` drops unticked sets and says how many (`droppedSets`); `discard` deletes only the workout tree; template and folder deletes do not cascade into history (T-037 tests). |
| Merges (`ExerciseEditor.mergeAll`) | Safe, one note | One transaction; chains that would hit a deleted source throw and roll back rather than losing rows. Note: nothing stops merging a timed exercise into a weight-and-reps one, which leaves sets with 0 reps in the target's strength history. It is snapshot-protected and owner-initiated, so it is listed here, not changed. |
| Imports | Fixed in T-096 | Silent 1000× weight misread from `"1,000"`; Safari rejecting colon-less offsets. |

## Observations not fixed (judgement calls for the owner)

- **Automatic Dropbox backups only follow finished workouts.** Edits to past workouts, measurements and templates do not set the pending flag, so they reach Dropbox with the next finished workout or a manual "Back up to Dropbox now".
- **Hevy and FitNotes group by start time or date.** Two different Hevy workouts with an identical start time merge into one; a FitNotes day imported twice skips the sets added to that day after the first import (existing workouts are skipped as a whole).
- **Restoring replaces an in-progress workout** (it stays in the safety snapshot); the confirm dialog does not mention it.
- Not testable here: real OPFS and Safari behaviour, and a real Dropbox download (the browser check mocked Dropbox).
