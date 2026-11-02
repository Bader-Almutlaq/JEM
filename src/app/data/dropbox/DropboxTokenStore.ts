import { RETIRED_DROPBOX_APP_KEYS } from '../dropboxConfig';
import { DropboxError } from './DropboxError';

/** Phone-local Dropbox keys, outside SQLite and every backup. Access tokens are never persisted. */
const REFRESH_TOKEN_KEY = 'workout-tracker.dropbox.refresh-token';
const APP_KEY = 'workout-tracker.dropbox.app-key';
const PENDING_VERIFIER_KEY = 'workout-tracker.dropbox.pending-verifier';

/**
 * Heuristic: ten minutes allows switching to Safari without keeping an unfinished grant indefinitely.
 * RFC 7636 §4.1 defines the verifier's 43–128 unreserved characters.
 */
const PendingAuthorization = {
  lifetimeMilliseconds: 600_000,
  verifierPattern: /^[A-Za-z0-9._~-]{43,128}$/,
} as const;

/**
 * Stores this phone's refresh token and a pending PKCE verifier for at most ten minutes.
 * The verifier alone cannot obtain a token: Dropbox also requires its single-use authorization code.
 * Access tokens remain in memory; credentials never enter SQLite, backups or logs.
 * Guards even access to Safari's localStorage getter.
 */
export class DropboxTokenStore {
  constructor(private readonly storage: () => Storage = () => window.localStorage) {}

  /** The saved refresh token, or undefined before connecting; blocked storage is a readable failure. */
  read(): string | undefined {
    try {
      return this.storage().getItem(REFRESH_TOKEN_KEY) || undefined;
    } catch {
      throw new DropboxError('storage', 'Dropbox credentials could not be read on this phone. Check website storage.');
    }
  }

  /** Persist a refresh token before treating the connection as usable. */
  write(refreshToken: string): void {
    try {
      this.storage().setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch {
      throw new DropboxError(
        'storage',
        'Dropbox could not stay connected because this phone could not save its credentials.',
      );
    }
  }

  /** Read the optional device-specific public app key; a key of a deleted app is forgotten, not used. */
  readAppKey(): string | undefined {
    try {
      const saved = this.storage().getItem(APP_KEY)?.trim() || undefined;
      if (saved !== undefined && RETIRED_DROPBOX_APP_KEYS.includes(saved)) {
        this.storage().removeItem(APP_KEY);
        return undefined;
      }
      return saved;
    } catch {
      throw new DropboxError('storage', 'The Dropbox app key could not be read on this phone. Check website storage.');
    }
  }

  /** Save the device-specific key, or remove it to use the built-in default. */
  writeAppKey(key: string): void {
    try {
      if (key.trim().length === 0) this.storage().removeItem(APP_KEY);
      else this.storage().setItem(APP_KEY, key.trim());
    } catch {
      throw new DropboxError('storage', 'The Dropbox app key could not be saved on this phone. Check website storage.');
    }
  }

  /** Save the pending verifier before the owner leaves for Dropbox, bound to the app key and creation time (ms). */
  writePendingVerifier(verifier: string, createdAt: number, appKey: string): void {
    try {
      this.storage().setItem(PENDING_VERIFIER_KEY, JSON.stringify({ verifier, createdAt, appKey }));
    } catch {
      throw new DropboxError(
        'storage',
        'The Dropbox connection step could not be saved on this phone. Check website storage.',
      );
    }
  }

  /** Restore a valid pending verifier; invalid or expired entries are removed, including ones for a different app key. */
  readPendingVerifier(now: number, appKey: string): string | undefined {
    try {
      const stored = this.storage().getItem(PENDING_VERIFIER_KEY);
      if (stored === null) return undefined;
      let value: unknown;
      try {
        value = JSON.parse(stored);
      } catch {
        value = undefined;
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        'verifier' in value &&
        typeof value.verifier === 'string' &&
        PendingAuthorization.verifierPattern.test(value.verifier) &&
        'appKey' in value &&
        value.appKey === appKey &&
        'createdAt' in value &&
        typeof value.createdAt === 'number' &&
        Number.isFinite(value.createdAt) &&
        value.createdAt <= now &&
        now - value.createdAt < PendingAuthorization.lifetimeMilliseconds
      )
        return value.verifier;
      this.storage().removeItem(PENDING_VERIFIER_KEY);
      return undefined;
    } catch {
      throw new DropboxError(
        'storage',
        'The Dropbox connection step could not be read on this phone. Check website storage.',
      );
    }
  }

  /** Forget the pending step after use, disconnect or a changed app key; never touches the refresh token. */
  clearPendingVerifier(): void {
    try {
      this.storage().removeItem(PENDING_VERIFIER_KEY);
    } catch {
      throw new DropboxError('storage', 'The Dropbox connection step could not be cleared on this phone. Try again.');
    }
  }

  /** Remove only Dropbox's credentials; never touches workout data or Dropbox files. */
  clear(): void {
    try {
      this.storage().removeItem(REFRESH_TOKEN_KEY);
    } catch {
      throw new DropboxError(
        'storage',
        'Dropbox credentials could not be removed from this phone. Try Disconnect again.',
      );
    }
  }
}
