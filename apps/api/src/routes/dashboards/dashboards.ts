import type { AppEnv } from '../../index';

import { createDashboardSchema, dashboardIdParamSchema, dashboardListQuerySchema, updateDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { subjectLabel } from '../../middleware/access';
import { onValidationError } from '../../middleware/validate';

import * as dashboardOps from './dashboard-ops';

const app = new Hono<AppEnv>();

app.get('/', sValidator('query', dashboardListQuerySchema, onValidationError), async c => {
  const rows = await dashboardOps.listDashboards(createDb(c.env.DB), c.get('orgId'), c.req.valid('query'));
  return c.json(rows);
});

app.get('/:id', sValidator('param', dashboardIdParamSchema, onValidationError), async c => {
  const row = await dashboardOps.getDashboard(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.post('/', sValidator('json', createDashboardSchema, onValidationError), async c => {
  const row = await dashboardOps.createDashboard(createDb(c.env.DB), c.get('orgId'), c.req.valid('json'), subjectLabel(c.get('user')));
  return c.json(row, 201);
});

app.put('/:id', sValidator('param', dashboardIdParamSchema, onValidationError), sValidator('json', updateDashboardSchema, onValidationError), async c => {
  const row = await dashboardOps.updateDashboard(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id, c.req.valid('json'), subjectLabel(c.get('user')));
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.delete('/:id', sValidator('param', dashboardIdParamSchema, onValidationError), async c => {
  const deleted = await dashboardOps.deleteDashboard(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 204);
});

export { app as dashboardRoutes };
