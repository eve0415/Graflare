import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrometheusClient } from './client';

interface Captured {
  url: string;
  method: string;
  body: string | undefined;
  authorization: string | undefined;
}

const okResponse = { status: 'success', data: { resultType: 'vector', result: [] } };

const captureFetch = (): Captured[] => {
  const captured: Captured[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    captured.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      authorization: new Headers(init?.headers).get('Authorization') ?? undefined,
    });
    return Promise.resolve(new Response(JSON.stringify(okResponse), { status: 200 }));
  });
  return captured;
};

describe('prometheus client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts an instant query with a Bearer header', async () => {
    const captured = captureFetch();
    const client = new PrometheusClient('https://prom.example.com', { type: 'bearer', credentials: { token: 'tok' } }, 30_000);

    await client.instantQuery('up');

    expect(captured).toEqual([{ url: 'https://prom.example.com/api/v1/query', method: 'POST', body: 'query=up', authorization: 'Bearer tok' }]);
  });

  it('encodes Basic auth credentials', async () => {
    const captured = captureFetch();
    const client = new PrometheusClient('https://prom.example.com', { type: 'basic', credentials: { username: 'u', password: 'p' } }, 30_000);

    await client.instantQuery('up');

    expect(captured).toEqual([{ url: 'https://prom.example.com/api/v1/query', method: 'POST', body: 'query=up', authorization: `Basic ${btoa('u:p')}` }]);
  });

  it('posts a range query with start/end/step and no auth header when none', async () => {
    const captured = captureFetch();
    const client = new PrometheusClient('https://prom.example.com', { type: 'none' }, 30_000);

    await client.rangeQuery('up', 100, 200, '15s');

    expect(captured).toEqual([
      { url: 'https://prom.example.com/api/v1/query_range', method: 'POST', body: 'query=up&start=100&end=200&step=15s', authorization: undefined },
    ]);
  });

  it('maps a timeout error to a timeout response', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const client = new PrometheusClient('https://prom.example.com', { type: 'none' }, 1000);

    const result = await client.instantQuery('up');

    expect(result.status).toBe('error');
    expect(result.errorType).toBe('timeout');
  });

  it('returns an error response when the upstream fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    const client = new PrometheusClient('https://prom.example.com', { type: 'none' }, 1000);

    const result = await client.instantQuery('up');

    expect(result.status).toBe('error');
    expect(result.errorType).toBe('internal');
  });
});
