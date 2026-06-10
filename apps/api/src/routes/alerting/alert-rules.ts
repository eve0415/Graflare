import type { AppEnv } from '../../index';

import { alertRuleIdParamSchema, createAlertRuleSchema, updateAlertRuleSchema } from '@graflare/shared/schemas/alert-rule';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createRule, deleteRule, updateRule } from '../../alerting/rule-lifecycle';
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
  const created = await createRule({ db: createDb(c.env.DB), alertRule: c.env.ALERT_RULE }, c.get('orgId'), c.req.valid('json'));
  return c.json(created, 201);
});

app.put('/:id', sValidator('param', alertRuleIdParamSchema, onValidationError), sValidator('json', updateAlertRuleSchema, onValidationError), async c => {
  const updated = await updateRule({ db: createDb(c.env.DB), alertRule: c.env.ALERT_RULE }, c.get('orgId'), c.req.valid('param').id, c.req.valid('json'));

  if (updated === null) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(updated);
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

  await deleteRule({ db, alertRule: c.env.ALERT_RULE }, orgId, id);

  return c.body(null, 204);
});

export { app as alertRuleRoutes };
