import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloudflareApiError, createServiceToken, deleteServiceToken, listServiceTokens } from './access-service-tokens';

const AUTH = { apiToken: 'cf-secret-token', accountId: 'acct-123' };
const BASE = 'https://api.cloudflare.com/client/v4/accounts/acct-123/access/service_tokens';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

const captured: CapturedRequest[] = [];

const mockFetch = (responder: () => Response): void => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const req = new Request(input, init);
    captured.push({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return Promise.resolve(responder());
  });
};

const envelope = (result: unknown, ok = true): Response =>
  new Response(JSON.stringify({ success: ok, errors: [], messages: [], result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const must = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error('expected defined value');
  return v;
};

const mustBody = (v: string | null): string => {
  if (v === null) throw new Error('expected a request body');
  return v;
};

// Awaits a rejection and asserts it is a CloudflareApiError, returning it narrowed.
const expectCfError = async (p: Promise<unknown>): Promise<CloudflareApiError> => {
  const settled = await p.then(
    (): unknown => {
      throw new Error('expected the promise to reject');
    },
    (error: unknown) => error,
  );
  if (!(settled instanceof CloudflareApiError)) {
    throw new Error(`expected CloudflareApiError, got ${String(settled)}`);
  }
  return settled;
};

const createResult = {
  id: 'tok-1',
  client_id: 'client-1',
  client_secret: 'the-secret',
  name: 'ci',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
  duration: '8760h',
};

const listResultItem = {
  id: 'tok-1',
  client_id: 'client-1',
  name: 'ci',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  captured.length = 0;
});

describe('createServiceToken', () => {
  it('posts name+duration with bearer auth and parses the secret', async () => {
    mockFetch(() => envelope(createResult));

    const token = await createServiceToken(AUTH, { name: 'ci', duration: '8760h' });

    expect(token.client_secret).toBe('the-secret');
    expect(token.client_id).toBe('client-1');

    const req = must(captured[0]);
    expect(req.url).toBe(BASE);
    expect(req.method).toBe('POST');
    expect(req.headers.get('Authorization')).toBe('Bearer cf-secret-token');
    expect(req.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(mustBody(req.body))).toEqual({ name: 'ci', duration: '8760h' });
  });

  it('omits duration from the body when not provided', async () => {
    mockFetch(() => envelope(createResult));

    await createServiceToken(AUTH, { name: 'ci' });

    expect(JSON.parse(mustBody(must(captured[0]).body))).toEqual({ name: 'ci' });
  });

  it('throws CloudflareApiError on success:false', async () => {
    mockFetch(
      () => new Response(JSON.stringify({ success: false, errors: [{ code: 1001, message: 'bad token' }], messages: [], result: null }), { status: 200 }),
    );

    await expectCfError(createServiceToken(AUTH, { name: 'ci' }));
  });

  it('throws CloudflareApiError on non-2xx and carries status + cf errors without leaking the token', async () => {
    mockFetch(
      () => new Response(JSON.stringify({ success: false, errors: [{ code: 9109, message: 'Unauthorized' }], messages: [], result: null }), { status: 403 }),
    );

    const err = await expectCfError(createServiceToken(AUTH, { name: 'ci' }));
    expect(err.status).toBe(403);
    expect(err.errors).toEqual([{ code: 9109, message: 'Unauthorized' }]);
    expect(err.message).not.toContain('cf-secret-token');
  });
});

describe('listServiceTokens', () => {
  it('gets with bearer auth and parses items without a secret', async () => {
    mockFetch(() => envelope([listResultItem]));

    const tokens = await listServiceTokens(AUTH);

    expect(tokens).toHaveLength(1);
    expect(must(tokens[0]).client_id).toBe('client-1');
    expect('client_secret' in must(tokens[0])).toBe(false);

    const req = must(captured[0]);
    expect(req.url).toBe(BASE);
    expect(req.method).toBe('GET');
    expect(req.headers.get('Authorization')).toBe('Bearer cf-secret-token');
  });

  it('strips an unexpected secret leaked by the API from list items', async () => {
    mockFetch(() => envelope([{ ...listResultItem, client_secret: 'leaked' }]));

    const tokens = await listServiceTokens(AUTH);
    expect('client_secret' in must(tokens[0])).toBe(false);
  });

  it('throws CloudflareApiError on non-2xx', async () => {
    mockFetch(() => new Response('null', { status: 500 }));
    await expectCfError(listServiceTokens(AUTH));
  });
});

describe('deleteServiceToken', () => {
  it('deletes the token by id with bearer auth', async () => {
    mockFetch(() => envelope({ id: 'tok-1' }));

    await deleteServiceToken(AUTH, 'tok-1');

    const req = must(captured[0]);
    expect(req.url).toBe(`${BASE}/tok-1`);
    expect(req.method).toBe('DELETE');
    expect(req.headers.get('Authorization')).toBe('Bearer cf-secret-token');
  });

  it('url-encodes the token id', async () => {
    mockFetch(() => envelope({ id: 'a/b' }));
    await deleteServiceToken(AUTH, 'a/b');
    expect(must(captured[0]).url).toBe(`${BASE}/a%2Fb`);
  });

  it('throws CloudflareApiError on non-2xx', async () => {
    mockFetch(() => new Response(JSON.stringify({ success: false, errors: [], messages: [], result: null }), { status: 404 }));
    await expectCfError(deleteServiceToken(AUTH, 'tok-1'));
  });
});
