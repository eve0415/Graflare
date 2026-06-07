import type { AppEnv } from '../../index';

import { createNotificationPolicySchema, notificationPolicyIdParamSchema, updateNotificationPolicySchema } from '@graflare/shared/schemas/notification-policy';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { notificationPolicies } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(notificationPolicies).where(eq(notificationPolicies.orgId, orgId));
  return c.json(rows);
});

app.post('/', sValidator('json', createNotificationPolicySchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(notificationPolicies).values({
    id,
    orgId,
    parentId: data.parentId ?? null,
    contactPointId: data.contactPointId ?? null,
    groupBy: data.groupBy ?? ['alertname'],
    matchers: data.matchers ?? [],
    muteTimingIds: data.muteTimingIds ?? [],
    groupWaitS: data.groupWaitS ?? 30,
    groupIntervalS: data.groupIntervalS ?? 300,
    repeatIntervalS: data.repeatIntervalS ?? 14400,
    continueMatching: data.continueMatching ?? false,
    createdAt: now,
    updatedAt: now,
  });

  const rows = await db.select().from(notificationPolicies).where(eq(notificationPolicies.id, id)).limit(1);
  return c.json(rows[0], 201);
});

app.put('/:id', sValidator('param', notificationPolicyIdParamSchema, onValidationError), sValidator('json', updateNotificationPolicySchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(notificationPolicies)
    .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.parentId !== undefined) updates['parentId'] = data.parentId;
  if (data.contactPointId !== undefined) updates['contactPointId'] = data.contactPointId;
  if (data.groupBy !== undefined) updates['groupBy'] = data.groupBy;
  if (data.matchers !== undefined) updates['matchers'] = data.matchers;
  if (data.muteTimingIds !== undefined) updates['muteTimingIds'] = data.muteTimingIds;
  if (data.groupWaitS !== undefined) updates['groupWaitS'] = data.groupWaitS;
  if (data.groupIntervalS !== undefined) updates['groupIntervalS'] = data.groupIntervalS;
  if (data.repeatIntervalS !== undefined) updates['repeatIntervalS'] = data.repeatIntervalS;
  if (data.continueMatching !== undefined) updates['continueMatching'] = data.continueMatching;

  await db.update(notificationPolicies).set(updates).where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));

  const updated = await db.select().from(notificationPolicies).where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId))).limit(1);
  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', notificationPolicyIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: notificationPolicies.id })
    .from(notificationPolicies)
    .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(notificationPolicies).where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));

  return c.body(null, 204);
});

export { app as notificationPolicyRoutes };
