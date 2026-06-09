import type { AppEnv } from '../../index';

import { createServiceTokenSchema, serviceTokenIdParamSchema } from '@graflare/shared/schemas/service-token';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { CloudflareApiError, createServiceTokenClient } from '../../cloudflare/access-service-tokens';
import { createDb } from '../../db';
import { accessServiceTokens } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

// Cloudflare creates and validates the secret; this route persists only the
// public link (org → client_id + cf token id). The client_secret is returned to
// the caller exactly once, by POST /, and is never stored or re-read.

const app = new Hono<AppEnv>();

const cfClient = (env: AppEnv['Bindings']) => createServiceTokenClient({ apiToken: env.CF_API_TOKEN, accountId: env.CF_ACCOUNT_ID });

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db
    .select({
      id: accessServiceTokens.id,
      clientId: accessServiceTokens.clientId,
      name: accessServiceTokens.name,
      createdAt: accessServiceTokens.createdAt,
      expiresAt: accessServiceTokens.expiresAt,
    })
    .from(accessServiceTokens)
    .where(eq(accessServiceTokens.orgId, orgId));

  // timestamp_ms columns come back as Date; the metadata contract is epoch ms,
  // matching the RPC listServiceTokens so the two paths don't drift.
  return c.json(
    rows.map(row => ({
      id: row.id,
      clientId: row.clientId,
      name: row.name,
      createdAt: row.createdAt.getTime(),
      expiresAt: row.expiresAt === null ? null : row.expiresAt.getTime(),
    })),
  );
});

app.post('/', sValidator('json', createServiceTokenSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  let created;
  try {
    created = await cfClient(c.env).create(data);
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      return c.json({ error: 'Cloudflare API error creating service token' }, 502);
    }
    throw error;
  }

  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = created.expires_at === undefined ? null : new Date(created.expires_at);

  try {
    await db.insert(accessServiceTokens).values({
      id,
      orgId,
      cfTokenId: created.id,
      clientId: created.client_id,
      name: created.name,
      createdAt,
      expiresAt,
    });
  } catch (error) {
    // The CF token exists but its link row didn't persist — it would be an
    // orphaned live credential. Best-effort revoke it at Cloudflare; if that
    // also fails, log the cf token id (NOT a secret) for manual cleanup. Mirrors
    // the RPC createServiceToken path so the two don't drift.
    console.error('POST /service-tokens: link insert failed; rolling back CF token', created.id, error);
    try {
      await cfClient(c.env).delete(created.id);
    } catch (rollbackError) {
      console.error('POST /service-tokens: rollback of orphaned CF token failed; manual cleanup needed for', created.id, rollbackError);
    }
    return c.json({ error: 'Failed to persist service token' }, 500);
  }

  // The secret is returned ONCE here and never persisted.
  return c.json(
    {
      id,
      clientId: created.client_id,
      name: created.name,
      createdAt: createdAt.getTime(),
      expiresAt: expiresAt === null ? null : expiresAt.getTime(),
      clientSecret: created.client_secret,
    },
    201,
  );
});

app.delete('/:id', sValidator('param', serviceTokenIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select({ cfTokenId: accessServiceTokens.cfTokenId })
    .from(accessServiceTokens)
    .where(and(eq(accessServiceTokens.id, id), eq(accessServiceTokens.orgId, orgId)))
    .limit(1);

  const [row] = rows;
  if (row === undefined) {
    // Not found for this org — no cross-org revoke, no Cloudflare call.
    return c.json({ error: 'Not found' }, 404);
  }

  try {
    await cfClient(c.env).delete(row.cfTokenId);
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      return c.json({ error: 'Cloudflare API error revoking service token' }, 502);
    }
    throw error;
  }

  await db.delete(accessServiceTokens).where(and(eq(accessServiceTokens.id, id), eq(accessServiceTokens.orgId, orgId)));

  return c.body(null, 204);
});

export { app as serviceTokenRoutes };
