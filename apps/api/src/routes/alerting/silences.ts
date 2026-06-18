import type { AppEnv } from '../../index';

import { createSilenceSchema, silenceIdParamSchema, updateSilenceSchema } from '@graflare/shared/schemas/silence';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { onValidationError } from '../../middleware/validate';

import * as silenceOps from './silence-ops';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const rows = await silenceOps.listSilences(createDb(c.env.DB), c.get('orgId'));
  return c.json(rows);
});

app.get('/:id', sValidator('param', silenceIdParamSchema, onValidationError), async c => {
  const row = await silenceOps.getSilence(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.post('/', sValidator('json', createSilenceSchema, onValidationError), async c => {
  const row = await silenceOps.createSilence(createDb(c.env.DB), c.get('orgId'), c.req.valid('json'));
  return c.json(row, 201);
});

app.put('/:id', sValidator('param', silenceIdParamSchema, onValidationError), sValidator('json', updateSilenceSchema, onValidationError), async c => {
  const row = await silenceOps.updateSilence(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id, c.req.valid('json'));
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.delete('/:id', sValidator('param', silenceIdParamSchema, onValidationError), async c => {
  const deleted = await silenceOps.deleteSilence(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 204);
});

export { app as silenceRoutes };
