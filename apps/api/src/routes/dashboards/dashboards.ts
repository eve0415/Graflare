import type { AppEnv } from '../../index';

import { createDashboardSchema, dashboardIdParamSchema, dashboardListQuerySchema, updateDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { sValidator } from '@hono/standard-validator';
import { and, eq, like } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { dashboardVersions, dashboards } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';
import { slugify } from '../../slugify';

const app = new Hono<AppEnv>();

app.get('/', sValidator('query', dashboardListQuerySchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const query = c.req.valid('query');

  const conditions = [eq(dashboards.orgId, orgId)];

  if (query.folderId !== undefined) {
    conditions.push(eq(dashboards.folderId, query.folderId));
  }

  if (query.search !== undefined) {
    conditions.push(like(dashboards.title, `%${query.search}%`));
  }

  let rows = await db
    .select({
      id: dashboards.id,
      orgId: dashboards.orgId,
      folderId: dashboards.folderId,
      title: dashboards.title,
      slug: dashboards.slug,
      description: dashboards.description,
      tags: dashboards.tags,
      version: dashboards.version,
      createdAt: dashboards.createdAt,
      updatedAt: dashboards.updatedAt,
    })
    .from(dashboards)
    .where(and(...conditions));

  if (query.tag !== undefined) {
    const { tag } = query;
    rows = rows.filter(r => r.tags.includes(tag));
  }

  return c.json(rows);
});

app.get('/:id', sValidator('param', dashboardIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(rows[0]);
});

app.post('/', sValidator('json', createDashboardSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');
  const user = c.get('user');

  const id = crypto.randomUUID();
  const now = new Date();
  const slug = slugify(data.title);

  await db.insert(dashboards).values({
    id,
    orgId,
    folderId: data.folderId ?? null,
    title: data.title,
    slug,
    description: data.description ?? '',
    tags: data.tags ?? [],
    panels: data.panels ?? [],
    variables: data.variables ?? [],
    timeRange: data.timeRange ?? { from: 'now-1h', to: 'now', refresh: null },
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const versionId = crypto.randomUUID();
  const dashboardData = { ...data, id, orgId, slug, version: 1 };
  await db.insert(dashboardVersions).values({
    id: versionId,
    dashboardId: id,
    version: 1,
    data: JSON.stringify(dashboardData),
    message: 'Initial version',
    createdBy: user.email,
    createdAt: now,
  });

  const created = await db.select().from(dashboards).where(eq(dashboards.id, id)).limit(1);
  return c.json(created[0], 201);
});

app.put('/:id', sValidator('param', dashboardIdParamSchema, onValidationError), sValidator('json', updateDashboardSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');
  const user = c.get('user');

  const existing = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);

  const [current] = existing;
  if (current === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }

  const now = new Date();
  const newVersion = current.version + 1;

  const { message, ...updates } = data;
  const setData: Record<string, unknown> = { updatedAt: now, version: newVersion };

  if (updates.title !== undefined) {
    setData['title'] = updates.title;
    setData['slug'] = slugify(updates.title);
  }
  if (updates.folderId !== undefined) setData['folderId'] = updates.folderId;
  if (updates.description !== undefined) setData['description'] = updates.description;
  if (updates.tags !== undefined) setData['tags'] = updates.tags;
  if (updates.panels !== undefined) setData['panels'] = updates.panels;
  if (updates.variables !== undefined) setData['variables'] = updates.variables;
  if (updates.timeRange !== undefined) setData['timeRange'] = updates.timeRange;

  await db
    .update(dashboards)
    .set(setData)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)));

  const updated = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);

  const versionId = crypto.randomUUID();
  await db.insert(dashboardVersions).values({
    id: versionId,
    dashboardId: id,
    version: newVersion,
    data: JSON.stringify(updated[0]),
    message: message ?? '',
    createdBy: user.email,
    createdAt: now,
  });

  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', dashboardIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(dashboards).where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)));

  return c.body(null, 204);
});

export { app as dashboardRoutes };
