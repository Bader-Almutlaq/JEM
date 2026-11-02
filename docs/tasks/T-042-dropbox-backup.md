# T-042: Automatic backup to the owner's Dropbox

- **Milestone:** R11 · **Depends on:** T-041 (merged) · **Model tier:** strong (Codex Sol: OAuth, iOS quirks, data safety)

## Goal

After every finished workout, a full backup uploads silently to the owner's Dropbox app folder. Connecting is a one-time step in Settings. The manual share-sheet backup stays as a fallback.

## Read first

- `AGENTS.md` (Offline always: the Dropbox exception), `docs/DECISIONS.md` → *2026-10-31: Automatic backups go to the owner's Dropbox* (flow, token storage, retention), `docs/DATA.md` → *Backups*.
- `src/app/features/settings/BackupSection.tsx`, `useBackupFile.ts`, `src/app/features/workout/BackupReminderLine.tsx` (finish-summary backup row), the finish flow in `src/app/features/workout/`, `src/core/backup/*` (export bytes, `lastBackupAt`, `BackupAge`, `BackupReminder`), `src/worker/WorkerApi.ts` (backup export endpoint).
- Dropbox HTTP API:
  - OAuth PKCE for public clients: `https://www.dropbox.com/oauth2/authorize` with `response_type=code`, `code_challenge` (S256), `token_access_type=offline` and **no `redirect_uri`**, so Dropbox shows the code to copy.
  - Token endpoint: `https://api.dropboxapi.com/oauth2/token` (`grant_type=authorization_code` with `code_verifier`; `grant_type=refresh_token`; `client_id` only, no secret).
  - `content.dropboxapi.com/2/files/upload`, `api.dropboxapi.com/2/files/list_folder`, `/2/files/delete_v2`, `/2/auth/token/revoke`.

## Scope

- **Create:**
  - `src/app/data/dropboxConfig.ts`: `DROPBOX_APP_KEY` constant, empty for now. When it is empty the whole feature is hidden. The lead fills it in.
  - `src/app/data/dropbox/` with small modules:
    - PKCE helpers (verifier, S256 challenge via `crypto.subtle`)
    - token store: refresh token in `localStorage` under one key, wrapped in try/catch; the access token in memory only
    - API calls via `fetch`: upload, list, delete, revoke
  - `src/core/backup/CloudRetention.ts` (+ test): a pure function choosing which app backups to delete. Keep the newest 14 and the earliest backup of each calendar month (local time). Input: name, path and server time. Output: paths to delete. Only names matching the backup pattern are ever candidates.
- **Edit:** the settings backup section, the finish flow and the finish-summary backup row, `WorkerApi.ts` (only if needed, in its own block `// Dropbox backup (T-042)`), `docs/DATA.md` (Backups: Dropbox, connecting steps for the owner), `docs/ARCHITECTURE.md` concept rows (cloud backup, retention).
- **Do not touch:** charts, analytics, migrations, import. App state other than the token goes in `appSetting` rows: `cloudBackupProvider`, `lastCloudBackupAt`, `cloudBackupPending`.

## Specification

1. **Connect (Settings → Backups → Dropbox).**
   - **Connect Dropbox** opens the authorize URL in a new window/tab (`window.open` inside the tap) and keeps the PKCE verifier in memory.
   - The screen then shows: "Approve in Dropbox, copy the code it shows, and paste it here", a code field, and **Finish connecting**.
   - Exchange the code for tokens and store the refresh token. Upload a first backup right away.
   - Show "Connected · last backup 2 min ago", **Back up to Dropbox now**, and **Disconnect**. Disconnect revokes the token and clears local state. It never deletes Dropbox files.
   - Errors are readable ("That code didn't work; codes expire after a few minutes. Try Connect again.").
2. **After Finish.**
   - When connected, after the workout is saved: get an access token (refresh it if missing or expired), export the database (the existing export), and upload it as `/WorkoutTracker-YYYY-MM-DDTHH-mm-ss.sqlite` with `mode: add`. Record `lastCloudBackupAt` (also update `lastBackupAt`, so the reminder knows).
   - Then apply retention: list the app folder and delete the paths returned by `CloudRetention`.
   - The finish summary's backup row shows "Backing up to Dropbox…" → "Backed up to Dropbox just now", or "Dropbox backup didn't finish: <reason>" with **Try again** and the existing **Back up now** (share sheet).
   - Never block finishing a workout.
3. **Offline / failures.**
   - On any failure, set `cloudBackupPending` and show the reason.
   - Retry a pending backup when the app opens and on the `online` event (silent, since the refresh token needs no tap), and from the Settings button.
   - A refresh token Dropbox rejects (revoked) clears the connection and shows "Reconnect Dropbox".
   - Log failures with `log.backup` and never swallow them.
4. **Safety.**
   - The upload sends the same bytes as the manual backup.
   - Retention never runs after a failed upload and deletes only app backup files.
   - Tokens never go into the database, logs or backup files.
5. `make format`; `make verify` must pass. Mock `fetch` and `crypto` where needed; no network in tests.

## Round 2 (lead): the app key is a setting

The owner's app key is `b8z4v0ynb7g98v6` (public; put it in `DROPBOX_APP_KEY` as the built-in default). The app must also work for other people:
- Settings → Backups → Dropbox gains **Use your own Dropbox app key** (collapsed by default). It shows a short how-to: create an app at dropbox.com/developers/apps with Scoped access and App folder; tick `files.metadata.read`, `files.content.write` and `files.content.read`; copy the App key. Then a field and **Save**.
- The effective key is the user's saved key if set, otherwise the built-in default. Store it in `localStorage` next to the token (it is not secret, but it belongs to this device's connection). Changing the key disconnects first (revoke with the old key), then asks to connect again.
- With no built-in default and no saved key, the section offers only the key setup, plus the manual backup.
- The manual **Back up now** (share sheet to iCloud Drive or Files) stays visible in all cases, labelled as the alternative.
- Read the key through one function (e.g. `effectiveDropboxAppKey()`); nothing else reads `DROPBOX_APP_KEY` directly.
- Tests: effective-key selection; changing the key disconnects; hidden-state rules.

## Acceptance criteria

- [ ] `CloudRetention` tests: newest 14 kept; month-first kept; nothing deleted with 14 or fewer; local-month boundaries; non-matching names ignored.
- [ ] PKCE tests (challenge for a known verifier, RFC 7636 example).
- [ ] Mocked-fetch tests:
  - connect exchange
  - refresh on expiry
  - upload, then retention
  - no deletion after a failed upload
  - a revoked token clears the connection
- [ ] Caption and state text tests.
- [ ] Feature hidden when `DROPBOX_APP_KEY` is empty.
- [ ] Docs updated (DATA with the owner's connect steps, ARCHITECTURE).

## Handoff

- **Status:** Implemented, ready for lead review; uncommitted as requested. `docs/tasks/BOARD.md` is unchanged.
- **What was done:** Added browser-only Dropbox PKCE copy-code connection, guarded refresh-token persistence, memory-only access tokens, refresh/revoke, validated export upload, complete paginated listing and conservative retention. Added shared Settings/finish status, retry/reconnect actions, first-connect upload, non-blocking upload after Finish, and app-open/online pending retries. Manual sharing remains available. The public app key remains empty, hiding/disabling the feature.
- **Files touched:** `src/app/data/dropboxConfig.ts`; new modules/tests in `src/app/data/dropbox/` (`DropboxBackup`, `DropboxApi`, `DropboxTokenStore`, `DropboxError`, `pkce`, `cloudBackup`, `useDropboxBackup`, `dropboxCaption`); `src/core/backup/CloudRetention.ts` and test; `src/worker/WorkerApi.ts` and `WorkerApi.dropbox.test.ts`; Settings `BackupSection.tsx` plus new `DropboxBackupSection`, `DropboxCodeForm`, CSS and rendering tests; workout `workoutActions.ts`, `BackupReminderLine.tsx`, new `DropboxBackupLine`/CSS and finish-flow tests; `docs/DATA.md`, `docs/ARCHITECTURE.md`, and this Handoff only.
- **Public API:** `cloudBackupPathsToDelete(files)` with `CloudBackupFile`/`CloudRetention`; `DropboxBackup` lifecycle/action/subscription methods and view/database/tab types; `DropboxApi`, `DropboxTokenStore`, `DropboxError`; PKCE helpers; `dropboxBackup` singleton, `useDropboxBackup`, `dropboxCaption`. Worker adds `cloudBackupSettings()` and `updateCloudBackupSettings(change)` plus their types. The existing `BackupExport` gains `changeVersion`; existing consumers still use the same filename/bytes.
- **Decisions taken:** Retention orders by Dropbox `server_modified`, keeping the newest 14 and earliest surviving backup of each local calendar month; only exact filenames with matching root paths and valid times qualify. Uploads use add without autorename, so files cannot overwrite each other or fall outside the naming pattern. Same-second filename collisions produce a readable retryable conflict. List/prune failures preserve the successful upload timestamp and leave pending work. Network failures keep credentials; invalid refresh grants clear them and offer Reconnect. Disconnect only forgets usable credentials once revocation succeeds (an already-revoked grant counts as disconnected). The app opens a blank tab synchronously in the tap and navigates it after the PKCE hash, keeping Safari user activation. All raw HTTP/crypto errors are replaced with safe messages before logging, so tokens/codes/response bodies cannot leak. Pending is committed with a saved workout; export revisions prevent an older upload from clearing pending changes made during upload. The singleton loads eagerly through existing route imports, so no App/main edits were needed.
- **Open questions / left over:** Lead must fill the public key for an App folder Dropbox app with `files.content.write` and `files.metadata.read`, then test real copy-code OAuth and upload/reconnect on the iPhone Home Screen. Live visual/Safari checks could not run: `make dev` was denied by the sandbox (`listen EPERM 0.0.0.0:5173`); no escalation or deployment was attempted. iOS can suspend uploads when the app is backgrounded; pending retries recover when the app opens. Uploads over Dropbox's single-upload 150 MB limit show the manual backup fallback. The task does not own `src/core/db/AppSetting.ts`, so the three named cloud keys and their small SQL read/write block live in `WorkerApi.ts`; the lead may consolidate them into the central setting registry in a separately scoped change. No network was used by tests.
- **How it was verified:** `make format`, then `make verify`: lint, strict core/app/tool TypeScript checks, **766 tests across 104 files** (47 added tests), production build and PWA precache generation passed. Coverage includes RFC 7636 known challenge, crypto randomness, key-disabled behavior, code exchange, access expiry/401 refresh, revoked grants, offline/storage-safe errors, upload-before-retention, no deletion after failed upload, complete pagination, retention/local-month boundaries, render/caption text, app-open/online wiring, non-blocking Finish, real migrated in-memory database metadata/export round trips, and preservation of pending changes during upload. Browser layout and real Dropbox acceptance still need the checks above.

### Round 2 handoff

- **Status:** Implemented; uncommitted for lead review. The board was not edited.
- **Changes:** Added the owner's built-in key and an optional device-specific key, with Settings instructions and a manual Files backup labelled as an alternative. A different effective key revokes the existing grant using the old key before saving; a failed revocation preserves the connection and key. Clearing the field returns to the built-in default. With neither key, only setup is shown in the Dropbox section. Online retry wiring remains available if a key is added during the session.
- **Files:** `src/app/data/dropboxConfig.ts`, `src/app/data/dropbox/DropboxApi.ts`, `DropboxBackup.ts`, `DropboxTokenStore.ts`, `cloudBackup.ts`, new `effectiveDropboxAppKey.ts` and related tests; Settings `BackupSection.tsx`, `DropboxBackupSection.tsx`, CSS and tests, and new `DropboxAppKeyForm.tsx`; `docs/DATA.md`, `docs/ARCHITECTURE.md`, and this handoff.
- **Public API:** `effectiveDropboxAppKey(store, builtInKey?)`; `DropboxTokenStore.readAppKey()` and `writeAppKey(key)`; `DropboxBackup.saveAppKey(key)`; `DropboxApi.setAppKey(key)`; `DropboxAppKeyForm`.
- **Verification:** `make format` and `make verify` passed: 770 tests across 105 files, lint, TypeScript, and production build. Four tests were added for key selection and change handling; the existing rendering and startup tests were updated. Tests use mocked network access. Live Dropbox, iPhone and visual checks remain for the lead; no real connection was attempted.
- **Interpretations and limitations:** The key field starts empty; saving it empty removes the override and selects the built-in key. A different key cannot be saved offline while connected because revocation must succeed first. If localStorage cannot be read at startup, the feature starts disabled and logs a safe error rather than trying a possibly incorrect key with an existing token.
