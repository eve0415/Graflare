import type { AppEnv } from '../index';
import type { Context, MiddlewareHandler } from 'hono';

import { createDb } from '../db';
import { organizations } from '../db/schema';

const emailToOrgId = async (email: string): Promise<string> => {
  const data = new TextEncoder().encode(email.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `org-${hex.slice(0, 32)}`;
};

const orgMiddleware = (): MiddlewareHandler<AppEnv> => async (c: Context<AppEnv>, next) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);

  const orgId = await emailToOrgId(user.email);
  const now = new Date();
  await db
    .insert(organizations)
    .values({
      id: orgId,
      name: user.email,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  c.set('orgId', orgId);
  await next();
};

export { emailToOrgId, orgMiddleware };
