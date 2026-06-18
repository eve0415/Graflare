import type { AppEnv } from '../../index';

import { createDatasourceSchema, updateDatasourceSchema } from '@graflare/shared/schemas/datasource';
import { datasourceIdParamSchema } from '@graflare/shared/schemas/proxy';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { onValidationError } from '../../middleware/validate';

import * as datasourceOps from './datasource-ops';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const rows = await datasourceOps.listDatasources(createDb(c.env.DB), c.get('orgId'));
  return c.json(rows);
});

app.get('/:id', sValidator('param', datasourceIdParamSchema, onValidationError), async c => {
  const row = await datasourceOps.getDatasource(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.post('/', sValidator('json', createDatasourceSchema, onValidationError), async c => {
  const row = await datasourceOps.createDatasource(createDb(c.env.DB), c.get('orgId'), c.req.valid('json'), c.env.ENCRYPTION_KEY);
  return c.json(row, 201);
});

app.put('/:id', sValidator('param', datasourceIdParamSchema, onValidationError), sValidator('json', updateDatasourceSchema, onValidationError), async c => {
  const row = await datasourceOps.updateDatasource(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id, c.req.valid('json'), c.env.ENCRYPTION_KEY);
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.delete('/:id', sValidator('param', datasourceIdParamSchema, onValidationError), async c => {
  const deleted = await datasourceOps.deleteDatasource(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 204);
});

export { app as datasourceRoutes };
