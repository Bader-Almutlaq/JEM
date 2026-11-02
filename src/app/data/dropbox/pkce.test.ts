import { afterEach, expect, test, vi } from 'vitest';
import { authorizationUrl, createState, createVerifier, settingsRedirectUri, verifierChallenge } from './pkce';

afterEach(() => vi.unstubAllGlobals());

test('S256 matches the RFC 7636 Appendix B known verifier/challenge', async () => {
  await expect(verifierChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('verifiers use crypto randomness and only the unpadded base64url alphabet', () => {
  const random = vi.fn((bytes: Uint8Array) => bytes.fill(255));
  vi.stubGlobal('crypto', { getRandomValues: random });
  expect(createVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(createVerifier()).toBe('_'.repeat(42) + '8');
  expect(random).toHaveBeenCalledWith(new Uint8Array(32).fill(255));
});

test('authorize requests offline S256 code flow without a redirect or secret', () => {
  const url = new URL(authorizationUrl('public key', 'challenge'));
  expect(url.origin + url.pathname).toBe('https://www.dropbox.com/oauth2/authorize');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    client_id: 'public key',
    response_type: 'code',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    scope: 'files.content.write files.metadata.read files.content.read',
  });
});

test('redirect authorization includes the exact URI and state, without a secret', () => {
  const redirect = { redirectUri: 'https://example.com/workout-tracker/settings', state: 'random state' };
  const url = new URL(authorizationUrl('public key', 'challenge', redirect));
  expect(url.searchParams.get('redirect_uri')).toBe(redirect.redirectUri);
  expect(url.searchParams.get('state')).toBe(redirect.state);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.has('client_secret')).toBe(false);
});

test('OAuth state uses a separate crypto random draw from the verifier', () => {
  const random = vi.fn((bytes: Uint8Array) => bytes.fill(random.mock.calls.length));
  vi.stubGlobal('crypto', { getRandomValues: random });
  const verifier = createVerifier();
  const state = createState();
  expect(random).toHaveBeenCalledTimes(2);
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(state).not.toBe(verifier);
});

test.each([
  ['https://example.com', '/workout-tracker/', 'https://example.com/workout-tracker/settings'],
  ['http://localhost:5173', '/', 'http://localhost:5173/settings'],
  ['https://example.com', '/workout-tracker', 'https://example.com/workout-tracker/settings'],
])('Settings redirect follows origin %s and base %s', (origin, base, expected) => {
  expect(settingsRedirectUri(origin, base)).toBe(expected);
});
