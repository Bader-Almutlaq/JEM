/** A safe, owner-readable Dropbox failure; never includes response bodies, codes, or credentials. */
export class DropboxError extends Error {
  override readonly name = 'DropboxError';

  constructor(
    readonly kind: 'connection' | 'code' | 'revoked' | 'storage' | 'response' | 'disabled',
    message: string,
  ) {
    super(message);
  }

  /** A disabled/invalid client needs a new public app key rather than repeated authorization attempts. */
  static disabledApp(): DropboxError {
    return new DropboxError(
      'disabled',
      'This Dropbox app is switched off. Create a new one in Advanced, or update JEM.',
    );
  }
}
