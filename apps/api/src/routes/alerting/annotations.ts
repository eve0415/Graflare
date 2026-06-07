import type { AppEnv } from '../../index';

import { annotationIdParamSchema, annotationListQuerySchema, createAnnotationSchema } from '@graflare/shared/schemas/annotation';
import { sValidator } from '@hono/standard-validator';
import { and, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { annotations } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/', sValidator('query', annotationListQuerySchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const query = c.req.valid('query');

  const conditions = [eq(annotations.orgId, orgId)];
  if (query.dashboardId !== undefined) conditions.push(eq(annotations.dashboardId, query.dashboardId));
  if (query.alertRuleId !== undefined) conditions.push(eq(annotations.alertRuleId, query.alertRuleId));
  if (query.from !== undefined) conditions.push(gte(annotations.time, new Date(query.from)));
  if (query.to !== undefined) conditions.push(lte(annotations.time, new Date(query.to)));

  let rows = await db.select().from(annotations).where(and(...conditions));

  if (query.tag !== undefined) {
    const { tag } = query;
    rows = rows.filter(r => r.tags.includes(tag));
  }

  return c.json(rows);
});

app.post('/', sValidator('json', createAnnotationSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(annotations).values({
    id,
    orgId,
    dashboardId: data.dashboardId,
    panelId: data.panelId,
    alertRuleId: data.alertRuleId,
    time: new Date(data.time),
    timeEnd: data.timeEnd !== undefined ? new Date(data.timeEnd) : undefined,
    text: data.text,
    tags: data.tags ?? [],
    prevState: data.prevState,
    newState: data.newState,
    createdAt: now,
  });

  const rows = await db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
  return c.json(rows[0], 201);
});

app.delete('/:id', sValidator('param', annotationIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: annotations.id })
    .from(annotations)
    .where(and(eq(annotations.id, id), eq(annotations.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(annotations).where(and(eq(annotations.id, id), eq(annotations.orgId, orgId)));

  return c.body(null, 204);
});

export { app as annotationRoutes };
