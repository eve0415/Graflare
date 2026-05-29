import type { AppEnv } from '../index';

import { datasourceCredentialsSchema } from '@graflare/shared/schemas/datasource';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { decryptCredentials } from '../crypto/credentials';
import { createDb } from '../db';
import { datasources } from '../db/schema';

const app = new Hono<AppEnv>();

app.post('/:id/test', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  const rows = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);

  const [ds] = rows;
  if (ds === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }
  const start = Date.now();

  try {
    const headers: Record<string, string> = {};

    if (ds.credentials !== null) {
      const creds = datasourceCredentialsSchema.parse(JSON.parse(await decryptCredentials(ds.credentials, c.env.ENCRYPTION_KEY)));
      if (ds.authType === 'basic' && creds.username && creds.password) {
        headers['Authorization'] = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
      } else if (ds.authType === 'bearer' && creds.token) {
        headers['Authorization'] = `Bearer ${creds.token}`;
      }
    }

    const res = await fetch(`${ds.url}/api/v1/labels?limit=1`, {
      headers,
      signal: AbortSignal.timeout(ds.queryTimeoutMs),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return c.json({
        success: false,
        error: `Upstream returned ${res.status}`,
        latencyMs,
      });
    }

    return c.json({ success: true, latencyMs });
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : 'Connection failed';
    return c.json({ success: false, error: message, latencyMs });
  }
});

export { app as datasourceTestRoutes };
