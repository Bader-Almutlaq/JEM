# T-095: Restore from Dropbox, and offer a restore on a fresh install

- **Milestone:** Data safety · **Depends on:** T-042, T-052, T-054 (merged) · **Model tier:** high (Codex Sol)

## Goal

The owner (2026-11-02): "If I delete the app and download it again, what happens to the data? Do I have to re-import from Strong, or does Dropbox restore automatically? I want everything back, not just the history: my saved workouts and exercises too."

Deleting a Home Screen web app on iOS deletes its storage. Today the only way back is Settings → **Restore from a backup file…**, which needs the owner to fetch a `.sqlite` out of Dropbox through the Files app first. A backup is the whole SQLite file (history, saved workouts, plans, custom exercises, settings, pins, measurements), so restoring it brings everything back. What's missing is restoring straight from Dropbox, and a fresh install that offers it instead of an empty app.

## Read first

- `AGENTS.md`, `docs/DATA.md` (Dropbox, backups, restore), `docs/DECISIONS.md` (2026-10-31 Dropbox entries, T-052, T-054).
- `src/app/data/dropbox/DropboxApi.ts`, `DropboxBackup.ts`, `useDropboxBackup.ts`, `DropboxTokenStore.ts` (+ tests), `src/core/backup/BackupFile.ts`, `BackupRestore.ts`, `BackupValidation.ts`, `CloudRetention.ts`, `src/worker/WorkerApi.ts` (`restoreBackup`, `exportBackup`, overview counts), `src/app/features/settings/BackupSection.tsx`, `DropboxBackupSection.tsx`, the Workout tab's first screen (`src/app/features/workout/WorkoutScreen.tsx`, `StartWorkout.tsx`).

## Specification

1. **Download:** `DropboxApi.download(path)` using `https://content.dropboxapi.com/2/files/download` with the `Dropbox-API-Arg` header (path as JSON, non-ASCII escaped as Dropbox requires), returning the bytes. Same error handling and token refresh as `upload`. Readable `DropboxError` messages.
2. **List backups:** reuse `list()`; show only names `parseBackupFileName` accepts, newest first by the name's time, with the date and time in the phone's locale and the file size (add `size` to `CloudBackupFile` from Dropbox's `size` field).
3. **Settings → Dropbox:** when connected, a **Restore from Dropbox…** row opens a sheet listing the backups (newest first, at most the 30 newest with "Show older" for the rest). Tapping one asks the same confirmation as the file restore ("Restore this backup? It replaces what is on this phone. Your current data is kept as a safety snapshot."), then downloads it and calls the existing `database.restoreBackup` path (validation, safety snapshot, migrate, rollback all unchanged). Show progress ("Downloading…", "Restoring…") and the existing success text with the workout count.
4. **Never back up an empty phone over good backups:** if the database is empty (no finished workouts, no templates, no body measurements, no custom exercises), connecting Dropbox must **not** upload a first backup, and automatic uploads skip too. Instead, after connecting on an empty phone, open the restore sheet automatically if any backups exist (the owner still confirms). Add the emptiness check as one worker method (`isDatabaseEmpty()` or a field on an existing overview) backed by one core function with tests.
5. **Fresh install:** when the database is empty, the Workout tab shows one card above the empty state: **"Restore your data"** with two buttons: **Restore from Dropbox** (connects first if needed, then the sheet) and **Restore from a file** (the existing file picker and confirmation). The card goes away once there is data. Keep it small, per `docs/DESIGN.md`. No card on a phone with data.
6. **Dropbox app disabled:** if Dropbox's token or API answers that the app key is disabled or invalid (`invalid_client`, or an authorize error page the owner sees), show: "This Dropbox app is switched off. Create a new one in Advanced, or update JEM." Map it in `DropboxError`; no retry loop.
7. Tests: download success/failure/refresh; list ordering and filtering; empty-phone connect skips the upload and requests the sheet; non-empty connect still uploads; restore from downloaded bytes goes through the same worker restore (use the existing worker test harness, no database mocks); the emptiness function (each kind of data makes it non-empty, in-progress-only workout counts as empty? No: an in-progress workout counts as data).
8. Docs: DATA (restore from Dropbox, empty-phone rule, fresh-install card), DECISIONS (why an empty phone never uploads), DESIGN (card and sheet).

## Scope

`src/app/data/dropbox/*`, `src/app/features/settings/*Dropbox*`, `BackupSection.tsx` only if you share the confirmation, a new restore sheet and fresh-install card under `src/app/features/settings/` or `src/app/features/workout/`, `WorkoutScreen.tsx` for placing the card, `src/core/backup/` (emptiness function, `CloudBackupFile.size`), `src/worker/WorkerApi.ts` (one method), docs listed above.

## Acceptance criteria

- [ ] `make format`; `make verify` passes.
- [ ] Works at 430 × 932 in dark and light (the lead checks in the browser).
- [ ] Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

Implemented direct Dropbox restore, empty-phone upload protection, and the fresh-install restore card. Changes are uncommitted; BOARD.md and StartWorkout.tsx are unchanged.

- **Files:** Dropbox HTTP/coordinator/error/caption/PKCE code and tests in `src/app/data/dropbox/`; new `restorableDropboxBackups` and `restoreBackupNotice` helpers; Settings `BackupSection`, `DropboxBackupSection`/styles/tests and `DropboxAppKeyForm`; new `DropboxRestoreSheet`/styles/tests, `RestoreBackupConfirmation` and `RestoreFileSheet`; Workout `WorkoutScreen`, new `RestoreDataCard`/styles and `RestoreWorkoutScreen`; core `CloudRetention`/tests and new `isDatabaseEmpty`/tests; `WorkerApi.ts` and `WorkerApi.dropbox.test.ts`; DATA, DESIGN and DECISIONS.
- **Public API:** `DropboxApi.download(path): Promise<Uint8Array>`; required byte `CloudBackupFile.size`; core `isDatabaseEmpty(database): boolean` and worker `isDatabaseEmpty(): Promise<boolean>`; coordinator `openRestore()`, `closeRestore()`, `restore(path)`, restore choices/open state and listing/downloading/restoring phases. The coordinator's database interface now includes emptiness and the existing restore method. New UI exports are named for their files.
- **Behavior:** exact root backup filenames only, newest filename time first, local date/time and decimal kB/MB sizes, 30 choices per page. Confirmation precedes download. Downloaded bytes use the existing worker validation/snapshot/migration/rollback sequence. The sheet keeps progress and the workout-count result visible. Files and Dropbox share confirmation and success wording. Empty phones never upload or prune cloud backups; connection instead opens existing restore choices. `invalid_client` clears the unusable grant and pending retry and shows the specified Advanced/update instruction.
- **Interpretations:** unfinished workouts count as data. Conservatively, empty plans, imported/archived custom exercises and custom measurement sites count too; seeded library/sites and settings alone do not. No backup is applied automatically. A fresh Dropbox authorization returns to Settings, where the coordinator opens discovery if backups exist. Older Dropbox grants require disconnect/reconnect for the newly requested `files.content.read` scope; backups stay in Dropbox. Dropbox's external authorization error page cannot be inspected by JEM; Advanced documents that case. The new fresh-phone screen reuses existing start actions and template controls to keep the insertion inside scope.
- **Validation:** `make format`; `VITEST_MAX_WORKERS=2 make verify` passed, **1,607 tests in 244 files**, including **42 added tests**. Download/refresh/failures, listing/filtering, empty/non-empty connection, skipped automatic uploads, progress/confirmation/card markup and real SQLite worker restore/safety snapshots are covered. Verification used two workers with idle sleep inhibited; earlier runs hit intermittent timeouts in unchanged performance/cache tests. Production build succeeds with the existing chunk-size/dynamic-import warnings.
- **Remaining check:** 430 × 932 dark/light and real iPhone OAuth/file-picker interaction need visual verification; the browser host was unavailable in this session. `docs/ARCHITECTURE.md` was outside scope; the new emptiness owner is `src/core/backup/isDatabaseEmpty.ts` if its concept table is updated during integration.
