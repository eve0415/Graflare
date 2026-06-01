import type { AppEnv } from '../../index';

import { dashboardIdParamSchema, dashboardVersionParamSchema } from '@graflare/shared/schemas/dashboard';
import { sValidator } from '@hono/standard-validator';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { dashboardVersions, dashboards } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

const app = new Hono<AppEnv>();

app.get('/:id/versions', sValidator('param', dashboardIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const dashboard = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);

  if (dashboard.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const versions = await db
    .select({
      id: dashboardVersions.id,
      dashboardId: dashboardVersions.dashboardId,
      version: dashboardVersions.version,
      message: dashboardVersions.message,
      createdBy: dashboardVersions.createdBy,
      createdAt: dashboardVersions.createdAt,
    })
    .from(dashboardVersions)
    .where(eq(dashboardVersions.dashboardId, id))
    .orderBy(desc(dashboardVersions.version));

  return c.json(versions);
});

app.get('/:id/versions/:version', sValidator('param', dashboardVersionParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id, version } = c.req.valid('param');
  const versionNum = Number(version);

  const dashboard = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);

  if (dashboard.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const rows = await db
    .select()
    .from(dashboardVersions)
    .where(and(eq(dashboardVersions.dashboardId, id), eq(dashboardVersions.version, versionNum)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Version not found' }, 404);
  }

  return c.json(rows[0]);
});

app.post('/:id/versions/:version/restore', sValidator('param', dashboardVersionParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id, version } = c.req.valid('param');
  const versionNum = Number(version);
  const user = c.get('user');

  const existing = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const versionRows = await db
    .select()
    .from(dashboardVersions)
    .where(and(eq(dashboardVersions.dashboardId, id), eq(dashboardVersions.version, versionNum)))
    .limit(1);

  if (versionRows.length === 0) {
    return c.json({ error: 'Version not found' }, 404);
  }

  const [versionRow] = versionRows;
  if (versionRow === undefined) {
    return c.json({ error: 'Version not found' }, 404);
  }

  const snapshotData: unknown = JSON.parse(versionRow.data);
  if (typeof snapshotData !== 'object' || snapshotData === null) {
    return c.json({ error: 'Invalid version data' }, 500);
  }

  const snapshot = snapshotData;
  const [current] = existing;
  if (current === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }
  const now = new Date();
  const newVersion = current.version + 1;

  const restoreFields: Record<string, unknown> = { version: newVersion, updatedAt: now };

  if ('title' in snapshot && typeof snapshot.title === 'string') restoreFields['title'] = snapshot.title;
  if ('slug' in snapshot && typeof snapshot.slug === 'string') restoreFields['slug'] = snapshot.slug;
  if ('description' in snapshot && typeof snapshot.description === 'string') restoreFields['description'] = snapshot.description;
  if ('tags' in snapshot && Array.isArray(snapshot.tags)) restoreFields['tags'] = snapshot.tags;
  if ('panels' in snapshot && Array.isArray(snapshot.panels)) restoreFields['panels'] = snapshot.panels;
  if ('variables' in snapshot && Array.isArray(snapshot.variables)) restoreFields['variables'] = snapshot.variables;
  if ('timeRange' in snapshot && typeof snapshot.timeRange === 'object' && snapshot.timeRange !== null) {
    restoreFields['timeRange'] = snapshot.timeRange;
  }
  if ('folderId' in snapshot) restoreFields['folderId'] = snapshot.folderId;

  await db.update(dashboards).set(restoreFields).where(eq(dashboards.id, id));

  const updated = await db.select().from(dashboards).where(eq(dashboards.id, id)).limit(1);

  const versionId = crypto.randomUUID();
  await db.insert(dashboardVersions).values({
    id: versionId,
    dashboardId: id,
    version: newVersion,
    data: JSON.stringify(updated[0]),
    message: `Restored from version ${versionNum}`,
    createdBy: user.email,
    createdAt: now,
  });

  return c.json(updated[0]);
});

export { app as dashboardVersionRoutes };
