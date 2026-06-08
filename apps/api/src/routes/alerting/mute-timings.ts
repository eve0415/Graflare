import type { AppEnv } from '../../index';

import { createMuteTimingSchema, muteTimingIdParamSchema, updateMuteTimingSchema } from '@graflare/shared/schemas/mute-timing';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { muteTimings } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(muteTimings).where(eq(muteTimings.orgId, orgId));
  return c.json(rows);
});

app.get('/:id', sValidator('param', muteTimingIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select()
    .from(muteTimings)
    .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(rows[0]);
});

app.post('/', sValidator('json', createMuteTimingSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(muteTimings).values({
    id,
    orgId,
    name: data.name,
    intervals: data.intervals ?? [],
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, orgId, name: data.name, intervals: data.intervals ?? [], createdAt: now, updatedAt: now }, 201);
});

app.put('/:id', sValidator('param', muteTimingIdParamSchema, onValidationError), sValidator('json', updateMuteTimingSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(muteTimings)
    .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) updates['name'] = data.name;
  if (data.intervals !== undefined) updates['intervals'] = data.intervals;

  await db
    .update(muteTimings)
    .set(updates)
    .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));

  const updated = await db
    .select()
    .from(muteTimings)
    .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
    .limit(1);
  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', muteTimingIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: muteTimings.id })
    .from(muteTimings)
    .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(muteTimings).where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));

  return c.body(null, 204);
});

export { app as muteTimingRoutes };
