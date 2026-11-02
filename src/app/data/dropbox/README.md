# dropbox

Optional backup to the owner's own Dropbox (an app folder). This is the only way data leaves the phone, and only after the owner connects it.

- `DropboxBackup` is the orchestrator behind the `cloudBackup` singleton; `useDropboxBackup` exposes its state to screens.
- `pkce`, `DropboxTokenStore`, `DropboxApi`, `DropboxError`: sign-in, token storage and the HTTP calls.
- `effectiveDropboxAppKey` picks the built-in or the owner's own app key.
- `dropboxCaption`: the one status line shown in Settings and on the finish summary. `restorableDropboxBackups` and `restoreBackupNotice`: restore listing and messages.

Credentials stay outside SQLite and outside backups.
