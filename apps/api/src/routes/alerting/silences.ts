import type { AppEnv } from '../../index';

import { createSilenceSchema, silenceIdParamSchema, updateSilenceSchema } from '@graflare/shared/schemas/silence';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { silences } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(silences).where(eq(silences.orgId, orgId));
  return c.json(rows);
});

app.get('/:id', sValidator('param', silenceIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select()
    .from(silences)
    .where(and(eq(silences.id, id), eq(silences.orgId, orgId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(rows[0]);
});

app.post('/', sValidator('json', createSilenceSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(silences).values({
    id,
    orgId,
    matchers: data.matchers,
    startsAt: new Date(data.startsAt),
    endsAt: new Date(data.endsAt),
    comment: data.comment ?? '',
    createdBy: data.createdBy ?? '',
    createdAt: now,
    updatedAt: now,
  });

  const rows = await db.select().from(silences).where(eq(silences.id, id)).limit(1);
  return c.json(rows[0], 201);
});

app.put('/:id', sValidator('param', silenceIdParamSchema, onValidationError), sValidator('json', updateSilenceSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(silences)
    .where(and(eq(silences.id, id), eq(silences.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.matchers !== undefined) updates['matchers'] = data.matchers;
  if (data.startsAt !== undefined) updates['startsAt'] = new Date(data.startsAt);
  if (data.endsAt !== undefined) updates['endsAt'] = new Date(data.endsAt);
  if (data.comment !== undefined) updates['comment'] = data.comment;
  if (data.createdBy !== undefined) updates['createdBy'] = data.createdBy;

  await db.update(silences).set(updates).where(and(eq(silences.id, id), eq(silences.orgId, orgId)));

  const updated = await db.select().from(silences).where(and(eq(silences.id, id), eq(silences.orgId, orgId))).limit(1);
  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', silenceIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: silences.id })
    .from(silences)
    .where(and(eq(silences.id, id), eq(silences.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(silences).where(and(eq(silences.id, id), eq(silences.orgId, orgId)));

  return c.body(null, 204);
});

export { app as silenceRoutes };
