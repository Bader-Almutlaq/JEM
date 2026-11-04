import { cloudBackupPathsToDelete } from '../../../core/backup/CloudRetention';
import type { CloudBackupFile } from '../../../core/backup/CloudRetention';
import { BackupError } from '../../../core/backup/BackupError';
import { messageOf } from '../messageOf';
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
import { authorizationUrl, createVerifier, verifierChallenge } from './pkce';
import { restorableDropboxBackups } from './restorableDropboxBackups';
import { restoreBackupNotice } from './restoreBackupNotice';

/**
 * Shared connection/upload view state; credentials and the verifier never appear here.
 * message is a status failure, codeMessage/appKeyMessage answer their forms, and notice confirms the first backup.
 */
export interface DropboxBackupState {
  readonly enabled: boolean;
  readonly phase:
    'loading' | 'idle' | 'authorizing' | 'backingUp' | 'disconnecting' | 'listing' | 'downloading' | 'restoring';
  readonly connected: boolean;
  readonly awaitingCode: boolean;
  readonly reconnect: boolean;
  readonly lastBackupAt: string | undefined;
  readonly message: string | undefined;
  readonly codeMessage?: string | undefined;
  readonly appKeyMessage?: string | undefined;
  /** The key saved on this phone in Advanced, or `undefined` when JEM's built-in Dropbox app is used. */
  readonly customAppKey?: string | undefined;
  readonly appKeyInvalid?: boolean | undefined;
  readonly notice?: string | undefined;
  readonly restoreOpen?: boolean;
  readonly backups?: readonly CloudBackupFile[] | undefined;
}

/** Heuristic: the task's 5–40 alphanumeric format catches pasted secrets/URLs before changing the public app key. */
const DropboxAppKeyPolicy = { pattern: /^[A-Za-z0-9]{5,40}$/ } as const;

/** Cloud orchestration uses the existing worker backup/restore paths, emptiness query and non-secret settings only. */
export interface DropboxBackupDatabase {
  isDatabaseEmpty(): Promise<boolean>;
  restoreBackup(bytes: Uint8Array): Promise<RestoreResult>;
  /** A checked backup, or `null` when the phone holds no owner data (the worker refuses to back up an empty phone). */
  exportCloudBackup(): Promise<BackupExport | null>;
  cloudBackupSettings(): Promise<CloudBackupSettings>;
  updateCloudBackupSettings(change: CloudBackupSettingsUpdate): Promise<void>;
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
      customAppKey: this.savedAppKey(),
    };
  }

  private savedAppKey(): string | undefined {
    try {
      return this.tokens.readAppKey();
    } catch {
      return undefined;
    }
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
    return this.run(async () => {
      const settings = await this.database.cloudBackupSettings();
      const connected = this.tokens.read() !== undefined;
      const awaitingCode = this.tokens.readPendingVerifier(this.now().getTime(), this.appKey) !== undefined;
      this.update({
        connected,
        awaitingCode: !connected && awaitingCode,
        lastBackupAt: settings.lastCloudBackupAt,
        reconnect: !connected && settings.pending,
      });
      await this.database.updateCloudBackupSettings({ provider: connected ? 'dropbox' : null });
      if (connected && settings.pending && this.state.message === undefined) await this.upload();
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

  /** Open restore discovery without downloading or replacing data. Failures remain visible and never schedule uploads. */
  openRestore(): Promise<void> {
    this.update({ restoreOpen: true, backups: undefined, message: undefined, notice: undefined });
    return this.run(
      async () => {
        this.update({ phase: 'listing' });
        this.update({ backups: restorableDropboxBackups(await this.api.list()) });
      },
      false,
      false,
    );
  }

  /** Dismiss discovery; a confirmed restore keeps running even if its originating screen unmounts. */
  closeRestore(): void {
    this.update({ restoreOpen: false });
  }

  /** Download only a listed backup after confirmation, then use the same validated worker restore as Files. */
  restore(path: string): Promise<void> {
    return this.run(
      async () => {
        if (!this.state.backups?.some((file) => file.path === path)) {
          throw new DropboxError('response', 'Choose a backup from the Dropbox list first.');
        }
        this.update({ phase: 'downloading', message: undefined, notice: undefined });
        const bytes = await this.api.download(path);
        this.update({ phase: 'restoring' });
        const result = await this.database.restoreBackup(bytes).catch((error: unknown) => {
          // Comlink preserves Error.message but not the core error's prototype or custom kind.
          throw new DropboxError('storage', messageOf(error));
        });
        this.update({ notice: restoreBackupNotice(result.workoutCount) });
        try {
          const settings = await this.database.cloudBackupSettings();
          await this.database.updateCloudBackupSettings({ provider: 'dropbox', pending: false });
          this.update({ lastBackupAt: settings.lastCloudBackupAt });
        } catch {
          throw new DropboxError(
            'storage',
            'Your data was restored, but the Dropbox status could not be saved on this phone.',
          );
        }
      },
      false,
      false,
    );
  }

  /** Revoke before forgetting credentials; on network failure retain them so Disconnect can be retried. */
  disconnect(): Promise<void> {
    return this.run(async () => {
      this.update({ phase: 'disconnecting', message: undefined, codeMessage: undefined, notice: undefined });
      this.tokens.clearPendingVerifier();
      this.update({ awaitingCode: false });
      if (this.tokens.read() !== undefined) await this.api.revoke();
      this.update({
        connected: false,
        reconnect: false,
        awaitingCode: false,
        lastBackupAt: undefined,
        restoreOpen: false,
      });
      await this.database.updateCloudBackupSettings({ provider: null, pending: false, lastCloudBackupAt: null });
    });
  }

  /**
   * Forgets everything about Dropbox on this phone and goes back to JEM's built-in app: the connection, a half-done
   * connection, and a saved app key. It tries to revoke the connection first, but a dead app or no signal never stops
   * the reset. It never touches workout data or the files already in Dropbox.
   */
  resetConnection(): Promise<void> {
    return this.run(async () => {
      this.update({ phase: 'disconnecting', message: undefined, codeMessage: undefined, notice: undefined });
      if (this.tokens.read() !== undefined) {
        try {
          await this.api.revoke();
        } catch {
          log.backup.error('Dropbox could not be told to end the connection; forgetting it on this phone anyway.');
        }
      }
      this.api.clear();
      this.tokens.clearPendingVerifier();
      this.tokens.writeAppKey('');
      this.appKey = effectiveDropboxAppKey(undefined);
      this.api.setAppKey(this.appKey);
      this.update({
        enabled: this.appKey.length > 0,
        connected: false,
        reconnect: false,
        awaitingCode: false,
        lastBackupAt: undefined,
        restoreOpen: false,
        backups: undefined,
        customAppKey: undefined,
        appKeyInvalid: false,
        appKeyMessage: "Dropbox was reset on this phone. It uses JEM's built-in app again.",
      });
      await this.database.updateCloudBackupSettings({ provider: null, pending: false, lastCloudBackupAt: null });
    }, true);
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
          customAppKey: this.savedAppKey(),
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
      this.update({ customAppKey: this.savedAppKey() });
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

  private async completeConnection(): Promise<void> {
    this.update({ connected: true, reconnect: false });
    const empty = await this.database.isDatabaseEmpty();
    await this.database.updateCloudBackupSettings({ provider: 'dropbox', pending: !empty });
    if (empty) {
      this.update({ phase: 'listing', notice: 'Connected. No data on this phone has been backed up.' });
      const backups = restorableDropboxBackups(await this.api.list());
      this.update({ backups, restoreOpen: backups.length > 0 });
      return;
    }
    await this.upload();
    this.update({ notice: 'Connected. First backup saved to your Dropbox (Apps folder).' });
  }

  private async upload(): Promise<void> {
    if (await this.database.isDatabaseEmpty()) return;
    this.update({ phase: 'backingUp', message: undefined, notice: undefined });
    // Pending is set before the export so the export's change version covers it, and the flag clears afterwards.
    await this.database.updateCloudBackupSettings({ pending: true });
    // The worker refuses an empty phone too; this only happens if the data vanished since the check above.
    const backup = await this.database.exportCloudBackup();
    if (backup === null) return;
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

  private run(operation: () => Promise<void>, allowDisabled = false, recordPending = true): Promise<void> {
    if (!this.state.enabled && !allowDisabled) return Promise.resolve();
    const result = this.tail.then(async () => {
      try {
        await operation();
        this.update({ phase: 'idle' });
      } catch (error) {
        const failure =
          error instanceof DropboxError
            ? error
            : error instanceof BackupError
              ? new DropboxError('storage', error.message)
              : new DropboxError(
                  'storage',
                  'The Dropbox backup could not be prepared or recorded on this phone. Try again.',
                );
        log.backup.error(failure.message);
        if (allowDisabled) this.update({ appKeyMessage: failure.message, appKeyInvalid: true });
        if (failure.kind === 'revoked') this.update({ connected: false, reconnect: true, awaitingCode: false });
        if (failure.kind === 'disabled') {
          this.api.clear();
          this.update({ connected: false, reconnect: false, awaitingCode: false, appKeyInvalid: true });
        }
        this.update({ phase: 'idle', message: failure.message });
        if (!recordPending && failure.kind !== 'disabled' && failure.kind !== 'revoked') return;
        try {
          await this.database.updateCloudBackupSettings({
            pending: recordPending && failure.kind !== 'disabled',
            ...(failure.kind === 'revoked' || failure.kind === 'disabled' ? { provider: null } : {}),
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
