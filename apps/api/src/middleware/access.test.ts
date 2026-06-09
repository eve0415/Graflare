import type { AppEnv } from '../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { accessMiddleware, subjectFromPayload, verifyJwt } from './access';

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', accessMiddleware());
  app.get('/test', c => c.json({ user: c.get('user') }));
  return app;
};

const testBindings: AppEnv['Bindings'] = {
  ...env,
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

const asError = (value: unknown): Error => {
  if (!(value instanceof Error)) throw new TypeError('expected Error instance');
  return value;
};

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

const basePayload = {
  sub: 'sub',
  iss: 'https://test-team.cloudflareaccess.com',
  aud: ['test-aud'],
  exp: 0,
  iat: 0,
};

describe('subjectFromPayload (user vs service-token discriminator)', () => {
  it('maps a user JWT (email, no common_name) to a user subject', () => {
    expect(subjectFromPayload({ ...basePayload, email: 'u@example.com', name: 'U' })).toEqual({ kind: 'user', email: 'u@example.com', name: 'U' });
  });

  it('falls back the user name to the email when name is absent', () => {
    expect(subjectFromPayload({ ...basePayload, email: 'u@example.com' })).toEqual({ kind: 'user', email: 'u@example.com', name: 'u@example.com' });
  });

  it('maps a service-token JWT (common_name, empty sub, no email) to a service subject', () => {
    expect(subjectFromPayload({ ...basePayload, sub: '', common_name: 'client-abc.access' })).toEqual({
      kind: 'service',
      clientId: 'client-abc.access',
      name: 'client-abc.access',
    });
  });

  it('prefers common_name (service) when both claims are present', () => {
    expect(subjectFromPayload({ ...basePayload, email: 'u@example.com', common_name: 'client-abc.access' })).toEqual({
      kind: 'service',
      clientId: 'client-abc.access',
      name: 'client-abc.access',
    });
  });

  it('rejects an empty-string email with no common_name (no phantom user org)', () => {
    expect(subjectFromPayload({ ...basePayload, email: '' })).toBeNull();
  });

  it('treats an empty-string common_name as absent and falls back to the email', () => {
    expect(subjectFromPayload({ ...basePayload, common_name: '', email: 'u@example.com' })).toEqual({
      kind: 'user',
      email: 'u@example.com',
      name: 'u@example.com',
    });
  });

  it('returns null when neither claim is present', () => {
    expect(subjectFromPayload(basePayload)).toBeNull();
  });
});

describe('verifyJwt issuer normalization', () => {
  it('accepts slug-only teamDomain', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'test-team').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect(asError(err).message).not.toContain('Bad issuer');
  });

  it('accepts full domain (team.cloudflareaccess.com)', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'test-team.cloudflareaccess.com').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect(asError(err).message).not.toContain('Bad issuer');
  });

  it('accepts full URL (https://team.cloudflareaccess.com)', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'https://test-team.cloudflareaccess.com').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect(asError(err).message).not.toContain('Bad issuer');
  });

  it('rejects mismatched issuer with descriptive message', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'wrong-team').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect(asError(err).message).toBe('Bad issuer: expected https://wrong-team.cloudflareaccess.com, got https://test-team.cloudflareaccess.com');
  });

  it('rejects mismatched audience with descriptive message', async () => {
    const jwt = makeFakeJwt();
    const err = await verifyJwt(jwt, 'test-team', 'wrong-aud').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(Error);
    expect(asError(err).message).toBe('Bad audience: expected wrong-aud, got ["test-aud"]');
  });
});
