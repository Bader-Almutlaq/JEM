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

/** RFC 6749 §10.12: an independent, unpredictable value binds the authorization reply to this phone. */
export function createState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(PKCE.randomBytes)));
}

/** The deployment's own Settings URL, without query parameters, for both OAuth requests. */
export function settingsRedirectUri(origin: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(`${base}settings`, origin).href;
}

/** RFC 7636 §4.2: BASE64URL(SHA256(ASCII(verifier))), without padding. */
export async function verifierChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Dropbox PKCE URL; omitting redirect keeps the copy-code fallback. Never includes a client secret. */
export function authorizationUrl(
  appKey: string,
  challenge: string,
  redirect?: { readonly redirectUri: string; readonly state: string },
): string {
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    scope: 'files.content.write files.metadata.read files.content.read',
    ...(redirect === undefined ? {} : { redirect_uri: redirect.redirectUri, state: redirect.state }),
  }).toString();
  return url.href;
}
