import type { AppEnv } from '../../index';

import { alertRuleGroupIdParamSchema, createAlertRuleGroupSchema, updateAlertRuleGroupSchema } from '@graflare/shared/schemas/alert-rule-group';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { deleteRuleGroup, updateRuleGroup } from '../../alerting/rule-lifecycle';
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

app.put(
  '/:id',
  sValidator('param', alertRuleGroupIdParamSchema, onValidationError),
  sValidator('json', updateAlertRuleGroupSchema, onValidationError),
  async c => {
    const group = await updateRuleGroup({ db: createDb(c.env.DB), alertRule: c.env.ALERT_RULE }, c.get('orgId'), c.req.valid('param').id, c.req.valid('json'));

    if (group === null) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json(group);
  },
);

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

  await deleteRuleGroup({ db, alertRule: c.env.ALERT_RULE }, orgId, id);

  return c.body(null, 204);
});

export { app as alertRuleGroupRoutes };
