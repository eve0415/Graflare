import type { AppEnv } from '../../index';

import { createMuteTimingSchema, muteTimingIdParamSchema, updateMuteTimingSchema } from '@graflare/shared/schemas/mute-timing';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { onValidationError } from '../../middleware/validate';

import * as muteTimingOps from './mute-timing-ops';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const rows = await muteTimingOps.listMuteTimings(createDb(c.env.DB), c.get('orgId'));
  return c.json(rows);
});

app.get('/:id', sValidator('param', muteTimingIdParamSchema, onValidationError), async c => {
  const row = await muteTimingOps.getMuteTiming(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.post('/', sValidator('json', createMuteTimingSchema, onValidationError), async c => {
  const row = await muteTimingOps.createMuteTiming(createDb(c.env.DB), c.get('orgId'), c.req.valid('json'));
  return c.json(row, 201);
});

app.put('/:id', sValidator('param', muteTimingIdParamSchema, onValidationError), sValidator('json', updateMuteTimingSchema, onValidationError), async c => {
  const row = await muteTimingOps.updateMuteTiming(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id, c.req.valid('json'));
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.delete('/:id', sValidator('param', muteTimingIdParamSchema, onValidationError), async c => {
  const deleted = await muteTimingOps.deleteMuteTiming(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 204);
});

export { app as muteTimingRoutes };
