import type { AppEnv } from '../index';
import type { AuthSubject } from './access';

import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../db';
import { accessServiceTokens, organizations } from '../db/schema';

import { emailToOrgId, orgMiddleware } from './org';

describe('emailToOrgId', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(organizations);
  });

  it('generates deterministic org ID from email', async () => {
    const id1 = await emailToOrgId('test@example.com');
    const id2 = await emailToOrgId('test@example.com');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^org-[0-9a-f]{32}$/);
  });

  it('generates same ID regardless of email case', async () => {
    const id1 = await emailToOrgId('Test@Example.com');
    const id2 = await emailToOrgId('test@example.com');
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different emails', async () => {
    const id1 = await emailToOrgId('alice@example.com');
    const id2 = await emailToOrgId('bob@example.com');
    expect(id1).not.toBe(id2);
  });
});

// Drive orgMiddleware with the subject pre-set (as accessMiddleware would after
// verifying the JWT), so we test org resolution without a real CF signature.
const createApp = (subject: AuthSubject) => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('user', subject);
    await next();
  });
  app.use('/*', orgMiddleware());
  app.get('/test', c => c.json({ orgId: c.get('orgId') }));
  return app;
};

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: 'test-key',
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

const orgIdFromBody = async (res: Response): Promise<string> => {
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('orgId' in body) || typeof body.orgId !== 'string') {
    throw new Error('expected { orgId: string }');
  }
  return body.orgId;
};

const SERVICE_ORG = 'org-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CLIENT_ID = 'client-abc.access';

describe('orgMiddleware — user subject', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(accessServiceTokens);
    await db.delete(organizations);
  });

  it('resolves the email-hash org and bootstraps it on first sight', async () => {
    const res = await createApp({ kind: 'user', email: 'newuser@example.com', name: 'newuser@example.com' }).request('/test', {}, testBindings);
    expect(res.status).toBe(200);

    const orgId = await orgIdFromBody(res);
    expect(orgId).toBe(await emailToOrgId('newuser@example.com'));

    const rows = await createDb(env.DB).select().from(organizations).where(eq(organizations.id, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('newuser@example.com');
  });
});

describe('orgMiddleware — service-token subject (security proof)', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(accessServiceTokens);
    await db.delete(organizations);
    const now = new Date();
    // The org + link row exist because a user minted this token in Phase A.
    await db.insert(organizations).values({ id: SERVICE_ORG, name: 'owner@example.com', createdAt: now, updatedAt: now });
    await db.insert(accessServiceTokens).values({
      id: 'link-1',
      orgId: SERVICE_ORG,
      cfTokenId: 'cf-tok-1',
      clientId: CLIENT_ID,
      name: 'ci',
      createdAt: now,
      expiresAt: null,
    });
  });

  it('resolves to the link-row org and does NOT create a new org', async () => {
    const before = await createDb(env.DB).select().from(organizations);
    const res = await createApp({ kind: 'service', clientId: CLIENT_ID, name: 'ci' }).request('/test', {}, testBindings);
    expect(res.status).toBe(200);
    expect(await orgIdFromBody(res)).toBe(SERVICE_ORG);

    const after = await createDb(env.DB).select().from(organizations);
    expect(after).toHaveLength(before.length);
  });

  it('401s for an unknown client_id (no link row)', async () => {
    const res = await createApp({ kind: 'service', clientId: 'unknown.access', name: 'unknown.access' }).request('/test', {}, testBindings);
    expect(res.status).toBe(401);
  });

  it('401s for a revoked token (link row deleted) — revocation is effective', async () => {
    await createDb(env.DB).delete(accessServiceTokens).where(eq(accessServiceTokens.clientId, CLIENT_ID));

    const res = await createApp({ kind: 'service', clientId: CLIENT_ID, name: 'ci' }).request('/test', {}, testBindings);
    expect(res.status).toBe(401);
  });

  it('does not leak across orgs: a token only resolves to its own org', async () => {
    const otherOrg = 'org-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const now = new Date();
    await createDb(env.DB).insert(organizations).values({ id: otherOrg, name: 'other@example.com', createdAt: now, updatedAt: now });

    const res = await createApp({ kind: 'service', clientId: CLIENT_ID, name: 'ci' }).request('/test', {}, testBindings);
    const orgId = await orgIdFromBody(res);
    expect(orgId).toBe(SERVICE_ORG);
    expect(orgId).not.toBe(otherOrg);
  });
});
