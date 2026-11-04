import type { CloudBackupFile } from '../../../core/backup/CloudRetention';
import { log } from '../../../core/support/log';
import { DropboxError } from './DropboxError';
import { DropboxTokenStore } from './DropboxTokenStore';

/**
 * Dropbox HTTP API limits: single uploads are at most 150 MB; token expires_in is seconds.
 * Heuristic: refresh 30 seconds early and time out requests after 30 seconds to allow an offline retry.
 * https://www.dropbox.com/developers/documentation/http/documentation
 */
const DropboxHttp = {
  api: 'https://api.dropboxapi.com',
  content: 'https://content.dropboxapi.com',
  millisecondsPerSecond: 1000,
  expiryMarginMilliseconds: 30_000,
  timeoutMilliseconds: 30_000,
  maximumUploadBytes: 150 * 1024 * 1024,
  unicodeEscapeLength: 4,
  hexadecimalRadix: 16,
} as const;

interface AccessToken {
  readonly value: string;
  readonly expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether Dropbox says the app key itself was disabled or deleted. The token endpoint reports it as
 * `error: "invalid_client"`, the API endpoints as an `error_summary` starting `invalid_client/`; both mean the same.
 */
function isInvalidClient(result: unknown): boolean {
  if (!isRecord(result)) return false;
  const summary = result['error_summary'];
  return (
    result['error'] === 'invalid_client' || (typeof summary === 'string' && summary.split('/')[0] === 'invalid_client')
  );
}

function responseError(status: number, downloading = false): DropboxError {
  if (status === 401) return new DropboxError('revoked', 'Reconnect Dropbox to continue automatic backups.');
  if (status === 403 && downloading) {
    return new DropboxError(
      'response',
      'Dropbox refused this download. Disconnect and reconnect Dropbox to allow downloads, and check files.content.read in Advanced. Your backups stay in Dropbox.',
    );
  }
  if (status === 403)
    return new DropboxError('response', 'Dropbox refused access. Check the app permissions and available storage.');
  if (status === 409)
    return new DropboxError(
      'response',
      downloading
        ? 'Dropbox could not download that backup. Refresh the backup list and choose it again.'
        : 'Dropbox could not save or manage that file. Try again in a moment and check available storage.',
    );
  if (status === 429) return new DropboxError('response', 'Dropbox is busy. Try again in a few minutes.');
  return new DropboxError('response', 'Dropbox could not finish the request. Check your connection and try again.');
}

/** Minimal browser-only Dropbox HTTP client; short-lived access credentials remain in this instance's memory. */
export class DropboxApi {
  private accessToken: AccessToken | undefined;

  constructor(
    private appKey: string,
    private readonly tokens: DropboxTokenStore,
    // A wrapper, not `fetch` itself: called as this.request(...), a bare fetch throws "Illegal invocation".
    private readonly request: typeof fetch = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now,
  ) {}

  /** Change the public client key after the previous grant has been revoked. */
  setAppKey(appKey: string): void {
    this.appKey = appKey;
  }

  /** Exchange the pasted authorization code with the PKCE verifier it was requested with. */
  async exchange(code: string, verifier: string): Promise<void> {
    const result = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
    });
    if (typeof result['refresh_token'] !== 'string' || result['refresh_token'].length === 0) {
      throw new DropboxError('response', 'Dropbox did not allow automatic backups. Try Connect again.');
    }
    const accessToken = this.parseAccessToken(result);
    this.tokens.write(result['refresh_token']);
    this.accessToken = accessToken;
  }

  /** Upload the existing validated export, without overwriting or renaming another backup. */
  async upload(fileName: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > DropboxHttp.maximumUploadBytes) {
      throw new DropboxError(
        'response',
        'This backup is too large for a Dropbox upload. Use Back up now to save it to Files.',
      );
    }
    await this.authorizedRequest(`${DropboxHttp.content}/2/files/upload`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: `/${fileName}`, mode: 'add', autorename: false, mute: true }),
      },
      // Copy into an ordinary ArrayBuffer: Blob/fetch must not receive a SharedArrayBuffer-backed view.
      body: new Uint8Array(bytes).buffer,
    });
  }

  /** Download full SQLite bytes; Dropbox requires non-ASCII JSON header characters escaped as UTF-16 units. */
  async download(path: string): Promise<Uint8Array> {
    const argument = JSON.stringify({ path }).replace(
      /[\u007f-\uffff]/g,
      (character) =>
        `\\u${character.charCodeAt(0).toString(DropboxHttp.hexadecimalRadix).padStart(DropboxHttp.unicodeEscapeLength, '0')}`,
    );
    const response = await this.authorizedRequest(
      `${DropboxHttp.content}/2/files/download`,
      { headers: { 'Dropbox-API-Arg': argument } },
      { isDownload: true },
    );
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new DropboxError('connection', 'The backup download was interrupted. Try again when you are online.');
    }
  }

  /** Enumerate all file pages in the app-folder root; folders and deleted entries cannot become deletion candidates. */
  async list(): Promise<CloudBackupFile[]> {
    const files: CloudBackupFile[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.authorizedRequest(
        `${DropboxHttp.api}/2/files/${cursor === undefined ? 'list_folder' : 'list_folder/continue'}`,
        {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            cursor === undefined ? { path: '', recursive: false, include_deleted: false } : { cursor },
          ),
        },
      );
      const page = await this.json(response);
      if (!isRecord(page) || !Array.isArray(page['entries']) || typeof page['has_more'] !== 'boolean') {
        throw new DropboxError('response', 'Dropbox returned an unreadable file list. Try again.');
      }
      for (const entry of page['entries']) {
        if (
          isRecord(entry) &&
          entry['.tag'] === 'file' &&
          typeof entry['name'] === 'string' &&
          typeof entry['path_display'] === 'string' &&
          typeof entry['server_modified'] === 'string' &&
          typeof entry['size'] === 'number' &&
          Number.isSafeInteger(entry['size']) &&
          entry['size'] >= 0
        ) {
          files.push({
            name: entry['name'],
            path: entry['path_display'],
            serverTime: entry['server_modified'],
            size: entry['size'],
          });
        }
      }
      if (!page['has_more']) break;
      if (typeof page['cursor'] !== 'string' || page['cursor'].length === 0 || page['cursor'] === cursor) {
        throw new DropboxError('response', 'Dropbox returned an incomplete file list. Try again.');
      }
      cursor = page['cursor'];
    } while (cursor !== undefined);
    return files;
  }

  /** Delete one retention-selected path; callers must only use this after a successful upload. */
  async delete(path: string): Promise<void> {
    await this.authorizedRequest(`${DropboxHttp.api}/2/files/delete_v2`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  }

  /** Revoke the app grant, including its refresh token. A previously revoked grant is already disconnected. */
  async revoke(): Promise<void> {
    try {
      await this.authorizedRequest(`${DropboxHttp.api}/2/auth/token/revoke`, {});
    } catch (error) {
      if (!(error instanceof DropboxError) || error.kind !== 'revoked') throw error;
    }
    this.clear();
  }

  /** Clear both credential lifetimes after disconnect or a rejected refresh token. */
  clear(): void {
    this.accessToken = undefined;
    this.tokens.clear();
  }

  private async tokenRequest(parameters: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await this.send(`${DropboxHttp.api}/oauth2/token`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...parameters, client_id: this.appKey }).toString(),
    });
    const result = await this.json(response);
    if (!response.ok) {
      if (isInvalidClient(result)) {
        this.clear();
        throw DropboxError.disabledApp();
      }
      if (parameters['grant_type'] === 'authorization_code' && response.status === 400) {
        throw new DropboxError(
          'code',
          "Dropbox didn't accept that code. Codes work once and expire after a few minutes. Tap Open Dropbox for a new one.",
        );
      }
      if (isRecord(result) && result['error'] === 'invalid_grant' && parameters['grant_type'] === 'refresh_token') {
        this.clear();
        throw new DropboxError('revoked', 'Reconnect Dropbox to continue automatic backups.');
      }
      throw responseError(response.status);
    }
    if (!isRecord(result))
      throw new DropboxError('response', 'Dropbox returned unreadable credentials. Try Connect again.');
    return result;
  }

  private parseAccessToken(result: Record<string, unknown>): AccessToken {
    if (
      typeof result['access_token'] !== 'string' ||
      result['access_token'].length === 0 ||
      typeof result['expires_in'] !== 'number' ||
      !Number.isFinite(result['expires_in']) ||
      result['expires_in'] <= 0
    ) {
      throw new DropboxError('response', 'Dropbox returned unreadable credentials. Try Connect again.');
    }
    return {
      value: result['access_token'],
      expiresAt: this.now() + result['expires_in'] * DropboxHttp.millisecondsPerSecond,
    };
  }

  private async access(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.accessToken !== undefined &&
      this.accessToken.expiresAt > this.now() + DropboxHttp.expiryMarginMilliseconds
    ) {
      return this.accessToken.value;
    }
    const refreshToken = this.tokens.read();
    if (refreshToken === undefined)
      throw new DropboxError('revoked', 'Reconnect Dropbox to continue automatic backups.');
    const result = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    this.accessToken = this.parseAccessToken(result);
    return this.accessToken.value;
  }

  /** `isDownload` picks the download wording for a refused or missing file. */
  private async authorizedRequest(
    url: string,
    options: RequestInit,
    { isDownload = false }: { readonly isDownload?: boolean } = {},
  ): Promise<Response> {
    let token = await this.access();
    const send = () =>
      this.send(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    let response = await send();
    await this.rejectDisabledApp(response);
    if (response.status === 401) {
      token = await this.access(true);
      response = await send();
      await this.rejectDisabledApp(response);
    }
    if (!response.ok) {
      if (response.status === 401) this.clear();
      throw responseError(response.status, isDownload);
    }
    return response;
  }

  private async rejectDisabledApp(response: Response): Promise<void> {
    if (response.ok) return;
    const result: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    if (isInvalidClient(result)) {
      this.clear();
      throw DropboxError.disabledApp();
    }
  }

  private async send(url: string, options: RequestInit): Promise<Response> {
    try {
      return await this.request(url, {
        ...options,
        method: 'POST',
        signal: AbortSignal.timeout(DropboxHttp.timeoutMilliseconds),
      });
    } catch (error) {
      if (navigator.onLine === false)
        throw new DropboxError('connection', "No connection. Try again when you're online.");
      log.backup.error('Dropbox request failed', error);
      const reason = error instanceof Error ? ` (${error.message})` : '';
      throw new DropboxError('connection', `Dropbox couldn't be reached${reason}. Try again in a moment.`);
    }
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new DropboxError('response', 'Dropbox returned an unreadable response. Try again.');
    }
  }
}
