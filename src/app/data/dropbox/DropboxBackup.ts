import * as Comlink from 'comlink';
import { BackupError } from '../../../core/backup/BackupError';
import { listCloudBackups } from '../../../core/backup/CloudBackupListing';
import { cloudBackupPathsToDelete, type CloudBackupFile } from '../../../core/backup/CloudRetention';
import { log } from '../../../core/support/log';
import type {
  BackupExport,
  CloudBackupSettings,
  CloudBackupSettingsUpdate,
  RestoreResult,
} from '../../../worker/WorkerApi';
import { DropboxApi } from './DropboxApi';
import { DropboxError } from './DropboxError';
import { DropboxTokenStore } from './DropboxTokenStore';
import { effectiveDropboxAppKey } from './effectiveDropboxAppKey';
import { authorizationUrl, createState, createVerifier, verifierChallenge } from './pkce';

/**
 * Shared connection/upload view state; credentials and the verifier never appear here.
 * message is a status failure, codeMessage/appKeyMessage answer their forms, and notice confirms the first backup.
 */
export interface DropboxBackupState {
  readonly enabled: boolean;
  readonly phase: 'loading' | 'idle' | 'authorizing' | 'backingUp' | 'disconnecting' | 'listing' | 'restoring';
  readonly connected: boolean;
  readonly awaitingCode: boolean;
  readonly reconnect: boolean;
  readonly lastBackupAt: string | undefined;
  readonly message: string | undefined;
  readonly codeMessage?: string | undefined;
  readonly appKeyMessage?: string | undefined;
  readonly appKeyInvalid?: boolean | undefined;
  readonly notice?: string | undefined;
  /** Backups found in Dropbox, newest first; undefined until the owner asks for the list. */
  readonly backups?: readonly CloudBackupFile[] | undefined;
}

/** Heuristic: the task's 5–40 alphanumeric format catches pasted secrets/URLs before changing the public app key. */
const DropboxAppKeyPolicy = { pattern: /^[A-Za-z0-9]{5,40}$/ } as const;

/** Only the existing validated export and non-secret worker settings are available to cloud orchestration. */
export interface DropboxBackupDatabase {
  exportBackup(): Promise<BackupExport>;
  cloudBackupSettings(): Promise<CloudBackupSettings>;
  updateCloudBackupSettings(change: CloudBackupSettingsUpdate): Promise<void>;
  restoreBackup(bytes: Uint8Array): Promise<RestoreResult>;
}

/** A tab opened synchronously inside the tap, before awaiting the PKCE hash. */
export interface DropboxAuthorizationWindow {
  navigate(url: string): void;
  close(): void;
}

/**
 * Serializes connection, upload, retention, and disconnect for the lifetime of the open app.
 * Each public action reports failures in shared state and logs safe messages, never raw network errors.
 */
export class DropboxBackup {
  private state: DropboxBackupState;
  private readonly listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private appKey: string,
    private readonly database: DropboxBackupDatabase,
    private readonly tokens: DropboxTokenStore,
    private readonly api: DropboxApi,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = {
      enabled: appKey.length > 0,
      phase: appKey.length > 0 ? 'loading' : 'idle',
      connected: false,
      awaitingCode: false,
      reconnect: false,
      lastBackupAt: undefined,
      message: undefined,
    };
  }

  /** Stable snapshot for React's external-store subscription. */
  readonly snapshot = (): DropboxBackupState => this.state;

  /** Observe shared state even while the owner changes screens. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** On app open reconcile this phone's token with restored metadata, then silently retry a pending export. */
  initialize(): Promise<void> {
    return this.run(() => this.reconcile());
  }

  /** Read this phone's settings and token, publish them in state, then retry a pending export. */
  private async reconcile(): Promise<void> {
    const settings = await this.database.cloudBackupSettings();
    const connected = this.tokens.read() !== undefined;
    const pending = this.tokens.readPendingAuthorization(this.now().getTime(), this.appKey);
    const awaitingCode = pending !== undefined && pending.state === undefined;
    this.update({
      connected,
      awaitingCode: !connected && awaitingCode,
      lastBackupAt: settings.lastCloudBackupAt,
      reconnect: !connected && settings.pending,
    });
    await this.database.updateCloudBackupSettings({ provider: connected ? 'dropbox' : null });
    // Preserve a callback failure instead of immediately retrying its first backup and hiding the error.
    if (connected && settings.pending && this.state.message === undefined) await this.upload();
  }

  /** List the backups in the Dropbox app folder, newest first, so the owner can choose one to restore. */
  loadBackups(): Promise<void> {
    return this.run(async () => {
      this.update({ phase: 'listing', message: undefined, notice: undefined, backups: undefined });
      this.update({ backups: listCloudBackups(await this.api.list()) });
    });
  }

  /**
   * Replace this phone's data with one listed Dropbox backup. Only a path from the last listing is accepted.
   * The worker validates the file and keeps a safety snapshot before changing anything (`restoreBackup`);
   * a failed download or check leaves the data untouched. Afterwards the restored data's cloud settings
   * are reconciled with this phone's connection, which may upload the restored state as a new backup.
   */
  restoreFromDropbox(path: string): Promise<void> {
    return this.run(async () => {
      const chosen = this.state.backups?.find((file) => file.path === path);
      if (chosen === undefined)
        throw new DropboxError('response', 'That backup is no longer listed. Refresh the list.');
      this.update({ phase: 'restoring', message: undefined, notice: undefined });
      const bytes = await this.api.download(chosen.path);
      let result: RestoreResult;
      try {
        result = await this.database.restoreBackup(Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]));
      } catch (error) {
        if (error instanceof BackupError) throw new DropboxError('storage', error.message);
        throw error;
      }
      const count = result.workoutCount.toLocaleString();
      const notice = `Restored ${count} workouts from Dropbox. Your previous data is kept as a safety snapshot on this phone.`;
      this.update({ backups: undefined });
      try {
        await this.reconcile();
      } finally {
        // The restore itself succeeded even if the follow-up upload fails; keep saying so.
        this.update({ notice });
      }
    });
  }

  /** Save an independent state and PKCE verifier before navigating the same window to Dropbox. */
  beginRedirectConnect(redirectUri: string, navigate: (url: string) => void): Promise<void> {
    if (!this.state.enabled) return Promise.resolve();
    this.update({ phase: 'authorizing', message: undefined, codeMessage: undefined, notice: undefined });
    return this.run(async () => {
      try {
        const verifier = createVerifier();
        const state = createState();
        const challenge = await verifierChallenge(verifier);
        this.tokens.writePendingVerifier(verifier, this.now().getTime(), this.appKey, state);
        this.update({ awaitingCode: false });
        navigate(authorizationUrl(this.appKey, challenge, { redirectUri, state }));
      } catch (error) {
        this.tokens.clearPendingVerifier();
        this.update({ awaitingCode: false });
        if (error instanceof DropboxError) throw error;
        throw new DropboxError('connection', 'Dropbox could not open securely. Tap Open Dropbox to try again.');
      }
    });
  }

  /**
   * Consume only Settings OAuth queries, removing secrets synchronously before any asynchronous work.
   * The caller supplies the same deployment URI as beginRedirectConnect; reloads see a clean URL.
   */
  handleRedirect(redirectUri: string, currentUrl: string, replace: (url: string) => void): Promise<void> {
    const url = new URL(currentUrl);
    if (url.pathname !== new URL(redirectUri).pathname) return Promise.resolve();
    if (!url.searchParams.has('code') && !url.searchParams.has('state') && !url.searchParams.has('error')) {
      return Promise.resolve();
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    for (const parameter of ['code', 'state', 'error', 'error_description', 'error_uri']) {
      url.searchParams.delete(parameter);
    }
    replace(`${url.pathname}${url.search}${url.hash}`);
    return this.run(async () => {
      this.update({ phase: 'authorizing', message: undefined, codeMessage: undefined, notice: undefined });
      if (error !== null) {
        this.tokens.clearPendingVerifier();
        this.update({ awaitingCode: false });
        throw new DropboxError(
          'connection',
          error === 'access_denied'
            ? "Dropbox access wasn't allowed."
            : 'Dropbox could not finish connecting. Tap Open Dropbox again.',
        );
      }
      if (state === null || state.length === 0) throw this.replyMismatch();
      const pending = this.tokens.readPendingAuthorization(this.now().getTime(), this.appKey);
      if (pending === undefined) {
        this.update({ awaitingCode: false });
        throw new DropboxError('code', 'That Dropbox step expired or was already used. Tap Open Dropbox again.');
      }
      if (pending.state !== state || code === null || code.trim().length === 0) throw this.replyMismatch();
      // Consume before exchanging: a returned code works once even if its response is lost.
      this.tokens.clearPendingVerifier();
      this.update({ awaitingCode: false });
      await this.api.exchange(code, pending.verifier, redirectUri);
      await this.completeConnection();
    });
  }

  /** Open a tab inside the tap; persist its short-lived verifier before navigation so a restart can resume. */
  beginConnect(open: () => DropboxAuthorizationWindow | null): Promise<void> {
    if (!this.state.enabled) return Promise.resolve();
    let popup: DropboxAuthorizationWindow | null;
    try {
      popup = open();
    } catch {
      popup = null;
    }
    this.update({ phase: 'authorizing', message: undefined, codeMessage: undefined, notice: undefined });
    return this.run(async () => {
      if (popup === null) throw new DropboxError('connection', 'Allow a new tab to open, then tap Open Dropbox again.');
      this.update({ message: undefined });
      try {
        const verifier = createVerifier();
        const challenge = await verifierChallenge(verifier);
        this.tokens.writePendingVerifier(verifier, this.now().getTime(), this.appKey);
        popup.navigate(authorizationUrl(this.appKey, challenge));
        this.update({ awaitingCode: true });
      } catch (error) {
        popup.close();
        this.tokens.clearPendingVerifier();
        this.update({ awaitingCode: false });
        if (error instanceof DropboxError) throw error;
        throw new DropboxError('connection', 'Dropbox could not open securely. Tap Open Dropbox to try again.');
      }
    });
  }

  /** Exchange the pasted code, persist the connection, and upload its first full backup immediately. */
  finishConnecting(code: string): Promise<void> {
    return this.run(async () => {
      this.update({ phase: 'authorizing', message: undefined, codeMessage: undefined, notice: undefined });
      try {
        const verifier = this.tokens.readPendingVerifier(this.now().getTime(), this.appKey);
        this.update({ awaitingCode: verifier !== undefined });
        if (verifier === undefined) {
          throw new DropboxError('code', 'Tap Open Dropbox first, then paste the new code.');
        }
        if (code.trim().length === 0) {
          throw new DropboxError('code', 'Paste the code Dropbox shows, then tap Connect.');
        }
        // Consume before exchanging: a code works once, even if a response is lost in transit.
        this.tokens.clearPendingVerifier();
        this.update({ awaitingCode: false });
        await this.api.exchange(code.trim(), verifier);
      } catch (error) {
        if (error instanceof DropboxError) this.update({ codeMessage: error.message });
        throw error;
      }
      await this.completeConnection();
    });
  }

  /** Explicit retry from Settings or the finish summary. Never throws into the workout finish flow. */
  backUp(): Promise<void> {
    return this.run(() => this.upload());
  }

  /** Saved workouts trigger an upload only when this phone holds a refresh token. Finishing never awaits it. */
  afterWorkout(): Promise<void> {
    return this.run(async () => {
      if (this.tokens.read() !== undefined) await this.upload();
    });
  }

  /** Online events retry only pending work; a network change never uploads an unconnected database. */
  retryPending(): Promise<void> {
    return this.run(async () => {
      if (this.tokens.read() !== undefined && (await this.database.cloudBackupSettings()).pending) await this.upload();
    });
  }

  /** Revoke before forgetting credentials; on network failure retain them so Disconnect can be retried. */
  disconnect(): Promise<void> {
    return this.run(async () => {
      this.update({ phase: 'disconnecting', message: undefined, codeMessage: undefined, notice: undefined });
      this.tokens.clearPendingVerifier();
      this.update({ awaitingCode: false });
      if (this.tokens.read() !== undefined) await this.api.revoke();
      this.update({ connected: false, reconnect: false, awaitingCode: false, lastBackupAt: undefined });
      await this.database.updateCloudBackupSettings({ provider: null, pending: false, lastCloudBackupAt: null });
    });
  }

  /** Validate and save a device key with inline feedback; a changed key revokes the old connection, blank selects the default. */
  saveAppKey(key: string): Promise<void> {
    return this.run(async () => {
      const trimmed = key.trim();
      this.update({ appKeyMessage: undefined, appKeyInvalid: false });
      if (trimmed.length > 0 && !DropboxAppKeyPolicy.pattern.test(trimmed)) {
        this.update({ appKeyMessage: "That doesn't look like a Dropbox app key.", appKeyInvalid: true });
        return;
      }
      const selectedKey = trimmed || effectiveDropboxAppKey(undefined);
      if (selectedKey === this.appKey) {
        this.tokens.writeAppKey(trimmed);
        this.update({
          appKeyMessage: trimmed.length === 0 ? "Using JEM's built-in key." : 'That key is already in use.',
        });
        return;
      }
      this.tokens.clearPendingVerifier();
      this.update({ awaitingCode: false, codeMessage: undefined, notice: undefined });
      if (this.tokens.read() !== undefined) {
        this.update({ phase: 'disconnecting', message: undefined });
        await this.api.revoke();
        this.update({ connected: false, reconnect: false, lastBackupAt: undefined });
        await this.database.updateCloudBackupSettings({ provider: null, pending: false, lastCloudBackupAt: null });
      }
      this.tokens.writeAppKey(trimmed);
      this.appKey = selectedKey;
      this.api.setAppKey(this.appKey);
      this.update({
        enabled: this.appKey.length > 0,
        message: undefined,
        appKeyMessage:
          trimmed.length === 0 ? "Using JEM's built-in key." : 'Saved. Tap Open Dropbox to connect with it.',
      });
    }, true);
  }

  private replyMismatch(): DropboxError {
    return new DropboxError('code', "That Dropbox reply didn't match this phone. Tap Open Dropbox again.");
  }

  private async completeConnection(): Promise<void> {
    this.update({ connected: true, reconnect: false });
    await this.database.updateCloudBackupSettings({ provider: 'dropbox', pending: true });
    await this.upload();
    this.update({ notice: 'Connected. First backup saved to your Dropbox (Apps folder).' });
  }

  private async upload(): Promise<void> {
    this.update({ phase: 'backingUp', message: undefined, notice: undefined });
    await this.database.updateCloudBackupSettings({ pending: true });
    const backup = await this.database.exportBackup();
    await this.api.upload(backup.fileName, backup.bytes);
    const uploadedAt = this.now().toISOString();
    this.update({ lastBackupAt: uploadedAt, connected: true, reconnect: false });
    try {
      for (const path of cloudBackupPathsToDelete(await this.api.list())) await this.api.delete(path);
    } catch (error) {
      // The file is safe in Dropbox even when retention fails; still satisfy the manual reminder.
      await this.database.updateCloudBackupSettings({ lastCloudBackupAt: uploadedAt });
      throw error;
    }
    // A later workout or edit must retain its retry flag if it arrived during this upload.
    await this.database.updateCloudBackupSettings({
      lastCloudBackupAt: uploadedAt,
      pending: false,
      completedExportVersion: backup.changeVersion,
    });
  }

  private run(operation: () => Promise<void>, allowDisabled = false): Promise<void> {
    if (!this.state.enabled && !allowDisabled) return Promise.resolve();
    const result = this.tail.then(async () => {
      try {
        await operation();
        this.update({ phase: 'idle' });
      } catch (error) {
        const failure =
          error instanceof DropboxError
            ? error
            : new DropboxError(
                'storage',
                'The Dropbox backup could not be prepared or recorded on this phone. Try again.',
              );
        log.backup.error(failure.message);
        if (allowDisabled) this.update({ appKeyMessage: failure.message, appKeyInvalid: true });
        if (failure.kind === 'revoked') this.update({ connected: false, reconnect: true, awaitingCode: false });
        this.update({ phase: 'idle', message: failure.message });
        try {
          await this.database.updateCloudBackupSettings({
            pending: true,
            ...(failure.kind === 'revoked' ? { provider: null } : {}),
          });
        } catch {
          log.backup.error('The pending Dropbox backup could not be recorded on this phone.');
          this.update({
            message: `${failure.message} The pending retry could not be saved; try again before closing the app.`,
          });
        }
      }
    });
    this.tail = result;
    return result;
  }

  private update(change: Partial<DropboxBackupState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
}
