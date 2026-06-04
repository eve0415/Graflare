import type { AppEnv } from '../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { accessMiddleware, verifyJwt } from './access';

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', accessMiddleware());
  app.get('/test', c => c.json({ user: c.get('user') }));
  return app;
};

const testBindings: AppEnv['Bindings'] = {
  DB: env.DB,
  ENCRYPTION_KEY: 'test-key',
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

describe('access middleware', () => {
  it('returns 401 when no JWT header', async () => {
    const app = createApp();
    const res = await app.request('/test', {}, testBindings);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Missing Access JWT' });
  });

  it('returns 401 for invalid JWT format', async () => {
    const app = createApp();
    const res = await app.request('/test', { headers: { 'CF-Access-JWT-Assertion': 'not-a-jwt' } }, testBindings);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid Access JWT' });
  });

  it('returns 401 for malformed JWT segments', async () => {
    const app = createApp();
    const res = await app.request('/test', { headers: { 'CF-Access-JWT-Assertion': 'a.b' } }, testBindings);
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired JWT', async () => {
    const header = btoa(JSON.stringify({ alg: 'RS256', kid: 'test-kid' }));
    const payload = btoa(
      JSON.stringify({
        email: 'test@example.com',
        sub: 'test-sub',
        iss: 'test-iss',
        aud: ['test-aud'],
        exp: Math.floor(Date.now() / 1000) - 3600,
        iat: Math.floor(Date.now() / 1000) - 7200,
      }),
    );
    const fakeJwt = `${header}.${payload}.fake-signature`;

    const app = createApp();
    const res = await app.request('/test', { headers: { 'CF-Access-JWT-Assertion': fakeJwt } }, testBindings);
    expect(res.status).toBe(401);
  });
});

const makeFakeJwt = (overrides: Record<string, unknown> = {}) => {
  const header = btoa(JSON.stringify({ alg: 'RS256', kid: 'test-kid' }));
  const payload = btoa(
    JSON.stringify({
      email: 'test@example.com',
      sub: 'test-sub',
      iss: 'https://test-team.cloudflareaccess.com',
      aud: ['test-aud'],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      ...overrides,
    }),
  );
  return `${header}.${payload}.fake-signature`;
};

describe('verifyJwt issuer normalization', () => {
  it('accepts slug-only teamDomain', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'test-team').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('Bad issuer');
  });

  it('accepts full domain (team.cloudflareaccess.com)', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'test-team.cloudflareaccess.com').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('Bad issuer');
  });

  it('accepts full URL (https://team.cloudflareaccess.com)', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'https://test-team.cloudflareaccess.com').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('Bad issuer');
  });

  it('rejects mismatched issuer with descriptive message', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'wrong-team').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Bad issuer: expected https://wrong-team.cloudflareaccess.com, got https://test-team.cloudflareaccess.com');
  });

  it('rejects mismatched audience with descriptive message', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'test-team', 'wrong-aud').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Bad audience: expected wrong-aud, got ["test-aud"]');
  });
});
