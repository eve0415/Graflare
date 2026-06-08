import type { AppEnv } from '../../index';

import { alertInstanceListQuerySchema } from '@graflare/shared/schemas/alert-instance';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { alertInstances } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', sValidator('query', alertInstanceListQuerySchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const query = c.req.valid('query');

  const conditions = [eq(alertInstances.orgId, orgId)];
  if (query.ruleId !== undefined) conditions.push(eq(alertInstances.ruleId, query.ruleId));
  if (query.state !== undefined) conditions.push(eq(alertInstances.state, query.state));

  const rows = await db
    .select()
    .from(alertInstances)
    .where(and(...conditions));
  return c.json(rows);
});

export { app as alertInstanceRoutes };
