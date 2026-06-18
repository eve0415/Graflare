import type { AppEnv } from '../../index';
import type { DatasourceCredentials } from '@graflare/shared/schemas/datasource';

import { datasourceAuthType, datasourceCredentialsSchema } from '@graflare/shared/schemas/datasource';
import { datasourceIdParamSchema, instantQueryBodySchema, labelNameParamSchema, labelsQuerySchema, rangeQueryBodySchema } from '@graflare/shared/schemas/proxy';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { CacheApiStore, cachedProxyQuery } from '../../cache/query-cache';
import { decryptCredentials } from '../../crypto/credentials';
import { createDb } from '../../db';
import { datasources } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';
import { PrometheusClient } from '../../prometheus/client';

const app = new Hono<AppEnv>();

const getClient = async (c: { env: AppEnv['Bindings']; get: (key: string) => string; req: { param: (key: string) => string } }) => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  const rows = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);

  const [ds] = rows;
  if (ds === undefined) return null;

  let credentials: DatasourceCredentials | undefined;

  if (ds.credentials !== null) {
    credentials = datasourceCredentialsSchema.parse(JSON.parse(await decryptCredentials(ds.credentials, c.env.ENCRYPTION_KEY)));
  }

  const client = new PrometheusClient(
    ds.url,
    {
      type: datasourceAuthType.parse(ds.authType),
      ...(credentials !== undefined && { credentials }),
    },
    ds.queryTimeoutMs,
  );
  return { client, cacheTtl: ds.cacheTtl };
};

// `match[]` is a repeated query param: Hono hands sValidator('query', …) a bare
// string for a single value and an array only for repeated ones, so validating
// it through the query target would reject a legitimate single match[]. Read it
// with c.req.queries() (always string[] | undefined) and validate that array.
const readMatch = (c: { req: { queries: (key: string) => string[] | undefined } }) => labelsQuerySchema.safeParse({ 'match[]': c.req.queries('match[]') });

app.post(
  '/:id/proxy/api/v1/query',
  sValidator('param', datasourceIdParamSchema, onValidationError),
  sValidator('form', instantQueryBodySchema, onValidationError),
  async c => {
    const got = await getClient(c);
    if (!got) return c.json({ status: 'error', error: 'Not found' }, 404);

    const { query, time } = c.req.valid('form');
    const params: Record<string, string> = { query, ...(time !== undefined && { time }) };
    const result = await cachedProxyQuery(
      new CacheApiStore(caches.default),
      { orgId: c.get('orgId'), datasourceId: c.req.param('id'), endpoint: '/api/v1/query', params, cacheTtl: got.cacheTtl },
      () => got.client.instantQuery(query, time === undefined ? undefined : Number(time)),
      work => {
        c.executionCtx.waitUntil(work);
      },
    );
    return c.json(result);
  },
);

app.post(
  '/:id/proxy/api/v1/query_range',
  sValidator('param', datasourceIdParamSchema, onValidationError),
  sValidator('form', rangeQueryBodySchema, onValidationError),
  async c => {
    const got = await getClient(c);
    if (!got) return c.json({ status: 'error', error: 'Not found' }, 404);

    const { query, start, end, step } = c.req.valid('form');
    const params: Record<string, string> = { query, start, end, step };
    const result = await cachedProxyQuery(
      new CacheApiStore(caches.default),
      { orgId: c.get('orgId'), datasourceId: c.req.param('id'), endpoint: '/api/v1/query_range', params, cacheTtl: got.cacheTtl },
      // cachedProxyQuery snaps start/end into params for cache bucketing; query the upstream with those.
      p => got.client.rangeQuery(query, Number(p['start'] ?? start), Number(p['end'] ?? end), step),
      work => {
        c.executionCtx.waitUntil(work);
      },
    );
    return c.json(result);
  },
);

app.get('/:id/proxy/api/v1/labels', sValidator('param', datasourceIdParamSchema, onValidationError), async c => {
  const got = await getClient(c);
  if (!got) return c.json({ status: 'error', error: 'Not found' }, 404);

  const match = readMatch(c);
  if (!match.success) {
    return c.json({ error: 'Validation failed', details: match.error.issues }, 400);
  }

  const result = await got.client.labels(match.data['match[]']);
  return c.json(result);
});

app.get('/:id/proxy/api/v1/label/:name/values', sValidator('param', labelNameParamSchema, onValidationError), async c => {
  const got = await getClient(c);
  if (!got) return c.json({ status: 'error', error: 'Not found' }, 404);

  const match = readMatch(c);
  if (!match.success) {
    return c.json({ error: 'Validation failed', details: match.error.issues }, 400);
  }

  const { name } = c.req.valid('param');
  const result = await got.client.labelValues(name, match.data['match[]']);
  return c.json(result);
});

export { app as proxyRoutes };
