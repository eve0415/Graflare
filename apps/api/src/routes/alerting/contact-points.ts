import type { AppEnv } from '../../index';

import { contactPointIdParamSchema, createContactPointSchema, updateContactPointSchema } from '@graflare/shared/schemas/contact-point';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { onValidationError } from '../../middleware/validate';

import * as contactPointOps from './contact-point-ops';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const rows = await contactPointOps.listContactPoints(createDb(c.env.DB), c.get('orgId'));
  return c.json(rows);
});

app.get('/:id', sValidator('param', contactPointIdParamSchema, onValidationError), async c => {
  const row = await contactPointOps.getContactPoint(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.post('/', sValidator('json', createContactPointSchema, onValidationError), async c => {
  const row = await contactPointOps.createContactPoint(createDb(c.env.DB), c.get('orgId'), c.req.valid('json'), c.env.ENCRYPTION_KEY);
  return c.json(row, 201);
});

app.put('/:id', sValidator('param', contactPointIdParamSchema, onValidationError), sValidator('json', updateContactPointSchema, onValidationError), async c => {
  const row = await contactPointOps.updateContactPoint(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id, c.req.valid('json'), c.env.ENCRYPTION_KEY);
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.delete('/:id', sValidator('param', contactPointIdParamSchema, onValidationError), async c => {
  const deleted = await contactPointOps.deleteContactPoint(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 204);
});

export { app as contactPointRoutes };
