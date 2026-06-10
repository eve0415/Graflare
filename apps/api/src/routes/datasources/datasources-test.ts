import type { AppEnv } from '../../index';

import { datasourceIdParamSchema } from '@graflare/shared/schemas/proxy';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { datasources } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';
import { decryptedAuth } from '../../prometheus/auth';
import { testPrometheusEndpoint } from '../../prometheus/test-connection';
import { createSqlClient } from '../../sql/factory';

const app = new Hono<AppEnv>();

app.post('/:id/test', sValidator('param', datasourceIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);

  const [ds] = rows;
  if (ds === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (ds.type === 'sql') {
    const bridgeFetch = c.env.BRIDGE ? c.env.BRIDGE.fetch.bind(c.env.BRIDGE) : fetch;
    const client = await createSqlClient(ds, c.env.ENCRYPTION_KEY, bridgeFetch);
    return c.json(await client.testConnection());
  }

  const auth = await decryptedAuth(ds.credentials, ds.authType, c.env.ENCRYPTION_KEY);
  return c.json(await testPrometheusEndpoint(ds.url, auth, ds.queryTimeoutMs));
});

export { app as datasourceTestRoutes };
