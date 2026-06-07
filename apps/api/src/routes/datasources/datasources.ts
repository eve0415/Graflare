import type { AppEnv } from '../../index';

import { createDatasourceSchema, updateDatasourceSchema } from '@graflare/shared/schemas/datasource';
import { datasourceIdParamSchema } from '@graflare/shared/schemas/proxy';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { encryptCredentials } from '../../crypto/credentials';
import { createDb } from '../../db';
import { datasources } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db
    .select({
      id: datasources.id,
      orgId: datasources.orgId,
      name: datasources.name,
      type: datasources.type,
      url: datasources.url,
      authType: datasources.authType,
      queryTimeoutMs: datasources.queryTimeoutMs,
      createdAt: datasources.createdAt,
      updatedAt: datasources.updatedAt,
    })
    .from(datasources)
    .where(eq(datasources.orgId, orgId));

  return c.json(rows);
});

app.get('/:id', sValidator('param', datasourceIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select({
      id: datasources.id,
      orgId: datasources.orgId,
      name: datasources.name,
      type: datasources.type,
      url: datasources.url,
      authType: datasources.authType,
      queryTimeoutMs: datasources.queryTimeoutMs,
      createdAt: datasources.createdAt,
      updatedAt: datasources.updatedAt,
    })
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(rows[0]);
});

app.post('/', sValidator('json', createDatasourceSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const { credentials, ...rest } = c.req.valid('json');
  const id = crypto.randomUUID();
  const now = new Date();

  let encryptedCreds: string | null = null;
  if (credentials) {
    encryptedCreds = await encryptCredentials(JSON.stringify(credentials), c.env.ENCRYPTION_KEY);
  }

  await db.insert(datasources).values({
    id,
    orgId,
    ...rest,
    credentials: encryptedCreds,
    createdAt: now,
    updatedAt: now,
  });

  return c.json(
    {
      id,
      orgId,
      ...rest,
      createdAt: now,
      updatedAt: now,
    },
    201,
  );
});

app.put('/:id', sValidator('param', datasourceIdParamSchema, onValidationError), sValidator('json', updateDatasourceSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const { credentials, ...rest } = c.req.valid('json');
  const now = new Date();

  let encryptedCreds: string | undefined;
  if (credentials) {
    encryptedCreds = await encryptCredentials(JSON.stringify(credentials), c.env.ENCRYPTION_KEY);
  }

  await db
    .update(datasources)
    .set({
      ...rest,
      ...(encryptedCreds !== undefined && { credentials: encryptedCreds }),
      updatedAt: now,
    })
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)));

  const updated = await db
    .select({
      id: datasources.id,
      orgId: datasources.orgId,
      name: datasources.name,
      type: datasources.type,
      url: datasources.url,
      authType: datasources.authType,
      queryTimeoutMs: datasources.queryTimeoutMs,
      createdAt: datasources.createdAt,
      updatedAt: datasources.updatedAt,
    })
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);

  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', datasourceIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: datasources.id })
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(datasources).where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)));

  return c.body(null, 204);
});

export { app as datasourceRoutes };
