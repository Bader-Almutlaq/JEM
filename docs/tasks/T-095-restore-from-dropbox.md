# T-095: Restore from Dropbox

- **Milestone:** Backups · **Depends on:** T-042, T-052 (merged) · **Model tier:** medium

## Goal

Dropbox backups can be made automatically but were only restorable by saving the file to Files and picking it back. Let the owner (and friends using the built-in key) restore straight from the connected Dropbox folder: list the backups, choose one, confirm.

## Specification

1. Settings → Dropbox (connected only) has **Restore from Dropbox…**. It lists the app folder's JEM backups, newest first, each showing its Dropbox time and size.
2. Choosing a backup opens the same confirmation as restoring from a file (`RestoreConfirmDialog`): "Replace all current data with this backup? Your current data is kept as a safety snapshot first."
3. Confirming downloads the file, then hands it to the worker's existing `restoreBackup`, which validates it, saves a safety snapshot, replaces the data and rolls back on failure. A failed list, download or validation leaves the data untouched and shows a readable message. A success notice says how many workouts were restored.
4. Only this app's backups are offered: exact app file names in the app-folder root with a readable time (`listCloudBackups`, also used by retention). A path that was not in the last list is refused.
5. After a restore the Dropbox state is reconciled with this phone's token and the restored settings (`reconcile`, shared with app start), which may upload the restored state as a new backup. The success notice survives a failed follow-up upload.

## Acceptance

- `make verify` passes; tests cover the listing filter and order, download, the restore flow, refused paths, failed download, `BackupError` messages and the reconcile-after-restore case.
- Checked at 430 × 932 in dark and light with mocked Dropbox responses.

## Handoff

Done (lead, no Codex run available in the cloud session).

- Core: `src/core/backup/CloudBackupListing.ts` (`listCloudBackups`), now the one filter and order for both retention and restore. `CloudBackupFile` gained optional `sizeBytes`.
- `DropboxApi.download` (3-minute timeout, a download carries a whole database) and `size` in `list`.
- `DropboxBackup.loadBackups` and `restoreFromDropbox`; `initialize` now calls a shared private `reconcile`.
- UI: `DropboxRestore`, and `RestoreConfirmDialog` extracted from `BackupSection` so both restore sources share one dialog.
- Not checked on a real phone: the real Dropbox download (the browser check mocked it). Restoring a backup made by another phone works the same as restoring a file from it.
