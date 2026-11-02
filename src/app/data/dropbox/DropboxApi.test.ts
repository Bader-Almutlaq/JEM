import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropboxApi } from './DropboxApi';
import { DropboxTokenStore } from './DropboxTokenStore';

/** A Storage stand-in that keeps values in memory. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const tokenResponse = { access_token: 'access', expires_in: 14_400, refresh_token: 'refresh' };

describe('DropboxApi default request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls the browser fetch without rebinding it (regression: every request said "No connection")', async () => {
    // Browsers throw "Illegal invocation" when fetch runs with another object as `this`.
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) return Promise.reject(new TypeError('Illegal invocation'));
      return Promise.resolve(new Response(JSON.stringify(tokenResponse), { status: 200 }));
    });
    vi.stubGlobal('fetch', browserFetch);
    const storage = memoryStorage();
    const tokens = new DropboxTokenStore(() => storage);
    await new DropboxApi('appkey12345', tokens).exchange('code', 'verifier');
    expect(browserFetch).toHaveBeenCalledOnce();
    expect(tokens.read()).toBe('refresh');
  });

  it('names the reason when a request fails while online', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Load failed')));
    const api = new DropboxApi('appkey12345', new DropboxTokenStore(() => memoryStorage()));
    await expect(api.exchange('code', 'verifier')).rejects.toThrow("Dropbox couldn't be reached (Load failed).");
  });
});

describe('DropboxApi download', () => {
  function connected(request: typeof fetch) {
    const storage = memoryStorage();
    const tokens = new DropboxTokenStore(() => storage);
    tokens.write('refresh');
    return new DropboxApi('appkey12345', tokens, request);
  }

  it('sends the path in the API argument header and returns the file bytes', async () => {
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/oauth2/token')
        ? Response.json(tokenResponse)
        : new Response(new Uint8Array([5, 6, 7]), { status: 200 }),
    );
    const bytes = await connected(request).download('/WorkoutTracker-2026-10-01T10-00-00.sqlite');
    expect(Array.from(bytes)).toEqual([5, 6, 7]);
    const call = request.mock.calls.find(([url]) => String(url).endsWith('/2/files/download'));
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(JSON.parse(headers['Dropbox-API-Arg'] ?? '')).toEqual({
      path: '/WorkoutTracker-2026-10-01T10-00-00.sqlite',
    });
    expect(headers['Authorization']).toBe('Bearer access');
  });

  it('reports a missing file as a readable Dropbox error', async () => {
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/oauth2/token') ? Response.json(tokenResponse) : new Response('{}', { status: 409 }),
    );
    await expect(connected(request).download('/gone.sqlite')).rejects.toMatchObject({ kind: 'response' });
  });

  it('reports a body that fails mid-download as a connection error', async () => {
    const broken = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new TypeError('network lost'));
        },
      }),
    );
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/oauth2/token') ? Response.json(tokenResponse) : broken,
    );
    await expect(connected(request).download('/x.sqlite')).rejects.toMatchObject({ kind: 'connection' });
  });
});
