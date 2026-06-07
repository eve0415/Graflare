import type { AppEnv } from '../../index';

import { alertRuleIdParamSchema, createAlertRuleSchema, updateAlertRuleSchema } from '@graflare/shared/schemas/alert-rule';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { alertRules } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(alertRules).where(eq(alertRules.orgId, orgId));
  return c.json(rows);
});

app.get('/:id', sValidator('param', alertRuleIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(rows[0]);
});

app.post('/', sValidator('json', createAlertRuleSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(alertRules).values({
    id,
    orgId,
    groupId: data.groupId,
    title: data.title,
    queries: data.queries,
    condition: data.condition,
    labels: data.labels ?? {},
    annotations: data.annotations ?? {},
    forDurationS: data.forDurationS ?? 0,
    noDataState: data.noDataState ?? 'Alerting',
    execErrState: data.execErrState ?? 'Alerting',
    isPaused: data.isPaused ?? false,
    createdAt: now,
    updatedAt: now,
  });

  const rows = await db.select().from(alertRules).where(eq(alertRules.id, id)).limit(1);
  return c.json(rows[0], 201);
});

app.put('/:id', sValidator('param', alertRuleIdParamSchema, onValidationError), sValidator('json', updateAlertRuleSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.groupId !== undefined) updates['groupId'] = data.groupId;
  if (data.title !== undefined) updates['title'] = data.title;
  if (data.queries !== undefined) updates['queries'] = data.queries;
  if (data.condition !== undefined) updates['condition'] = data.condition;
  if (data.labels !== undefined) updates['labels'] = data.labels;
  if (data.annotations !== undefined) updates['annotations'] = data.annotations;
  if (data.forDurationS !== undefined) updates['forDurationS'] = data.forDurationS;
  if (data.noDataState !== undefined) updates['noDataState'] = data.noDataState;
  if (data.execErrState !== undefined) updates['execErrState'] = data.execErrState;
  if (data.isPaused !== undefined) updates['isPaused'] = data.isPaused;

  await db.update(alertRules).set(updates).where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));

  const updated = await db.select().from(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId))).limit(1);
  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', alertRuleIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: alertRules.id })
    .from(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));

  return c.body(null, 204);
});

export { app as alertRuleRoutes };
