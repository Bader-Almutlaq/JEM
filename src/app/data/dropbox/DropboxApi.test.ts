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

describe('DropboxApi.download', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const storage = memoryStorage();
    const tokens = new DropboxTokenStore(() => storage);
    tokens.write('refresh');
    const request = vi.fn<typeof fetch>();
    return { tokens, request, api: new DropboxApi('appkey12345', tokens, request) };
  }

  it('downloads raw bytes with escaped non-ASCII header JSON', async () => {
    const { api, request } = setup();
    const bytes = new Uint8Array([83, 81, 76, 0, 255]);
    request.mockResolvedValueOnce(Response.json(tokenResponse)).mockResolvedValueOnce(new Response(bytes));
    expect(await api.download('/نسخة-💪.sqlite')).toEqual(bytes);
    expect(request.mock.calls[1]?.[0]).toBe('https://content.dropboxapi.com/2/files/download');
    const headers = new Headers(request.mock.calls[1]?.[1]?.headers);
    const argument = headers.get('Dropbox-API-Arg') ?? '';
    expect(argument).toMatch(/^[\x20-\x7e]+$/);
    expect(JSON.parse(argument)).toEqual({ path: '/نسخة-💪.sqlite' });
    expect(headers.get('Authorization')).toBe('Bearer access');
    expect(request.mock.calls[1]?.[1]?.body).toBeUndefined();
  });

  it('refreshes once on 401 and retries the identical download', async () => {
    const { api, request } = setup();
    request
      .mockResolvedValueOnce(Response.json(tokenResponse))
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: 'new-access', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2])));
    expect(await api.download('/backup.sqlite')).toEqual(new Uint8Array([1, 2]));
    expect(request).toHaveBeenCalledTimes(4);
    expect(new Headers(request.mock.calls[3]?.[1]?.headers).get('Authorization')).toBe('Bearer new-access');
    expect(request.mock.calls[1]?.[0]).toBe(request.mock.calls[3]?.[0]);
  });

  it.each([403, 409, 429, 500])('returns a readable failure for HTTP %s', async (status) => {
    const { api, request } = setup();
    request.mockResolvedValueOnce(Response.json(tokenResponse)).mockResolvedValueOnce(Response.json({}, { status }));
    await expect(api.download('/backup.sqlite')).rejects.toMatchObject({
      name: 'DropboxError',
      kind: 'response',
      ...(status === 403 ? { message: expect.stringContaining('Disconnect and reconnect Dropbox') } : {}),
    });
  });

  it('clears a twice-rejected grant rather than retrying forever', async () => {
    const { api, request, tokens } = setup();
    request
      .mockResolvedValueOnce(Response.json(tokenResponse))
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json(tokenResponse))
      .mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(api.download('/backup.sqlite')).rejects.toMatchObject({ kind: 'revoked' });
    expect(request).toHaveBeenCalledTimes(4);
    expect(tokens.read()).toBeUndefined();
  });

  it('surfaces an interrupted response body', async () => {
    const { api, request } = setup();
    const response = new Response();
    vi.spyOn(response, 'arrayBuffer').mockRejectedValue(new Error('interrupted'));
    request.mockResolvedValueOnce(Response.json(tokenResponse)).mockResolvedValueOnce(response);
    await expect(api.download('/backup.sqlite')).rejects.toThrow('download was interrupted');
  });

  it('surfaces an offline download without attempting a restore', async () => {
    const { api, request } = setup();
    vi.stubGlobal('navigator', { onLine: false });
    request.mockResolvedValueOnce(Response.json(tokenResponse)).mockRejectedValueOnce(new TypeError('offline'));
    await expect(api.download('/backup.sqlite')).rejects.toMatchObject({
      kind: 'connection',
      message: expect.stringContaining('No connection'),
    });
  });

  it.each(['exchange', 'refresh', 'download'])(
    'maps invalid_client during %s to a disabled app without retries',
    async (step) => {
      const { api, request, tokens } = setup();
      if (step === 'download') request.mockResolvedValueOnce(Response.json(tokenResponse));
      request.mockResolvedValue(
        Response.json({ error: 'invalid_client' }, { status: step === 'download' ? 401 : 400 }),
      );
      const action = step === 'exchange' ? api.exchange('code', 'verifier') : api.download('/backup.sqlite');
      await expect(action).rejects.toMatchObject({
        kind: 'disabled',
        message: 'This Dropbox app is switched off. Create a new one in Advanced, or update JEM.',
      });
      expect(tokens.read()).toBeUndefined();
      expect(request).toHaveBeenCalledTimes(step === 'download' ? 2 : 1);
    },
  );
});
