import { afterEach, expect, test, vi } from 'vitest';
import { authorizationUrl, createVerifier, verifierChallenge } from './pkce';

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
    scope: 'files.metadata.read files.content.write files.content.read',
  });
});
