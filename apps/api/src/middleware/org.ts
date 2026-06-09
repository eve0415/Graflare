import type { AppEnv } from '../index';
import type { AuthSubject } from './access';
import type { Context, MiddlewareHandler } from 'hono';

import { eq } from 'drizzle-orm';

import { createDb } from '../db';
import { accessServiceTokens, organizations } from '../db/schema';

type Db = ReturnType<typeof createDb>;

const emailToOrgId = async (email: string): Promise<string> => {
  const data = new TextEncoder().encode(email.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `org-${hex.slice(0, 32)}`;
};

// The org a Graflare-provisioned service token belongs to, looked up by its
// client_id. null when no link row exists (an unknown or already-revoked token)
// → the caller must reject with 401. The link row is an explicit membership
// record (created org-scoped when a user minted the token), so it can only ever
// resolve to that one org — never cross-tenant.
const serviceTokenOrgId = async (db: Db, clientId: string): Promise<string | null> => {
  const rows = await db.select({ orgId: accessServiceTokens.orgId }).from(accessServiceTokens).where(eq(accessServiceTokens.clientId, clientId)).limit(1);
  return rows[0]?.orgId ?? null;
};

// Resolve the org for an authenticated subject. User orgs are bootstrapped on
// first sight (the email hash IS the org id); service-token orgs MUST already
// exist — a service token cannot create an org, only attach to the one that
// minted it. Returns null for an unknown/revoked service token (caller → 401).
// Shared by orgMiddleware (HTTP) and resolveAuth (RPC) so the two cannot drift.
const resolveOrgId = async (db: Db, subject: AuthSubject): Promise<string | null> => {
  if (subject.kind === 'service') {
    return serviceTokenOrgId(db, subject.clientId);
  }
  const orgId = await emailToOrgId(subject.email);
  const now = new Date();
  await db
    .insert(organizations)
    .values({
      id: orgId,
      name: subject.email,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  return orgId;
};

const orgMiddleware = (): MiddlewareHandler<AppEnv> => async (c: Context<AppEnv>, next) => {
  const subject = c.get('user');
  const db = createDb(c.env.DB);

  const orgId = await resolveOrgId(db, subject);
  if (orgId === null) {
    return c.json({ error: 'Unknown service token' }, 401);
  }

  c.set('orgId', orgId);
  return next();
};

export { emailToOrgId, orgMiddleware, resolveOrgId, serviceTokenOrgId };
