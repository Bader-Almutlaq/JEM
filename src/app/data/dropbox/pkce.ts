/** RFC 7636 §4.1: 32 random octets produce a 43-character base64url verifier. */
const PKCE = { randomBytes: 32 } as const;

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** A fresh cryptographically random RFC 7636 verifier; the coordinator owns its short pending lifetime. */
export function createVerifier(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(PKCE.randomBytes)));
}

/** RFC 7636 §4.2: BASE64URL(SHA256(ASCII(verifier))), without padding. */
export async function verifierChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/**
 * Dropbox PKCE URL for the copy-code connection: with no redirect URI, Dropbox shows the code on its own page for
 * the owner to paste into JEM. (A redirect back cannot work for a Home Screen web app, which Safari does not return to.)
 * Never includes a client secret.
 */
export function authorizationUrl(appKey: string, challenge: string): string {
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    scope: 'files.content.write files.metadata.read files.content.read',
  }).toString();
  return url.href;
}
