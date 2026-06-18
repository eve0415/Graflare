import type { AppEnv } from '../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accessMiddleware, resetKeyCache, subjectFromPayload, verifyJwt } from './access';

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

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const b64urlJson = (obj: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(obj)));

const signJwt = async (privateKey: CryptoKey, header: string, payload: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`)));

// Drive the real RS256 verification path (crypto.subtle.verify), which the other tests never reach
// because they stop at the cert fetch. Generate a key pair, serve its public JWK as the Access
// certs, and sign a genuine token — so a regression that weakened/removed signature checking fails.
describe('verifyJwt signature verification', () => {
  beforeEach(() => {
    resetKeyCache();
  });

  afterEach(() => {
    resetKeyCache();
    vi.restoreAllMocks();
  });

  const setup = async (): Promise<{ privateKey: CryptoKey; header: string; payload: string }> => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    if (!('publicKey' in pair)) throw new Error('expected an RSA key pair');
    const { publicKey, privateKey } = pair;
    const jwk = await crypto.subtle.exportKey('jwk', publicKey);
    if (!('n' in jwk) || !('e' in jwk) || !('kty' in jwk)) throw new Error('expected an RSA public JWK');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [{ kid: 'test-kid', kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' }] }), { status: 200 }),
    );
    const now = Math.floor(Date.now() / 1000);
    const header = b64urlJson({ alg: 'RS256', kid: 'test-kid' });
    const payload = b64urlJson({
      email: 'u@example.com',
      sub: 's',
      iss: 'https://test-team.cloudflareaccess.com',
      aud: ['test-aud'],
      exp: now + 3600,
      iat: now,
    });
    return { privateKey, header, payload };
  };

  it('accepts a token signed by the published key', async () => {
    const { privateKey, header, payload } = await setup();
    const token = `${header}.${payload}.${b64url(await signJwt(privateKey, header, payload))}`;

    const result = await verifyJwt(token, 'test-team', 'test-aud');

    expect(result.email).toBe('u@example.com');
  });

  it('rejects a token whose signature does not match its header/payload', async () => {
    const { privateKey, header, payload } = await setup();
    // A well-formed RS256 signature, but over DIFFERENT bytes — it must fail verification of the
    // real header.payload (proving the signature is actually checked, not just decoded).
    const wrongSig = await signJwt(privateKey, header, `${payload}-tampered`);
    const token = `${header}.${payload}.${b64url(wrongSig)}`;

    await expect(verifyJwt(token, 'test-team', 'test-aud')).rejects.toThrow('Invalid signature');
  });
});
