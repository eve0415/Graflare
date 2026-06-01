import type { AppEnv } from '../../index';

import { alertRuleGroupIdParamSchema, createAlertRuleGroupSchema, updateAlertRuleGroupSchema } from '@graflare/shared/schemas/alert-rule-group';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { alertRuleGroups } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(alertRuleGroups).where(eq(alertRuleGroups.orgId, orgId));
  return c.json(rows);
});

app.get('/:id', sValidator('param', alertRuleGroupIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select()
    .from(alertRuleGroups)
    .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(rows[0]);
});

app.post('/', sValidator('json', createAlertRuleGroupSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(alertRuleGroups).values({
    id,
    orgId,
    folderId: data.folderId ?? null,
    name: data.name,
    evalIntervalS: data.evalIntervalS ?? 60,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, orgId, folderId: data.folderId ?? null, name: data.name, evalIntervalS: data.evalIntervalS ?? 60, createdAt: now, updatedAt: now }, 201);
});

app.put('/:id', sValidator('param', alertRuleGroupIdParamSchema, onValidationError), sValidator('json', updateAlertRuleGroupSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(alertRuleGroups)
    .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) updates['name'] = data.name;
  if (data.folderId !== undefined) updates['folderId'] = data.folderId;
  if (data.evalIntervalS !== undefined) updates['evalIntervalS'] = data.evalIntervalS;

  await db.update(alertRuleGroups).set(updates).where(eq(alertRuleGroups.id, id));

  const updated = await db.select().from(alertRuleGroups).where(eq(alertRuleGroups.id, id)).limit(1);
  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', alertRuleGroupIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: alertRuleGroups.id })
    .from(alertRuleGroups)
    .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(alertRuleGroups).where(eq(alertRuleGroups.id, id));

  return c.body(null, 204);
});

export { app as alertRuleGroupRoutes };
