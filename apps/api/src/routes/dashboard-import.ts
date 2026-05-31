import type { AppEnv } from '../index';

import { importDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { detectFormat, importDashboard } from '@graflare/shared/import';
import { sValidator } from '@hono/standard-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../db';
import { dashboardVersions, dashboards } from '../db/schema';
import { onValidationError } from '../middleware/validate';

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

const app = new Hono<AppEnv>();

app.post('/', sValidator('json', importDashboardSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const user = c.get('user');
  const input = c.req.valid('json');

  const format = input.format ?? detectFormat(input.json);
  const { dashboard: imported, warnings } = importDashboard(input.json, format);

  const id = crypto.randomUUID();
  const now = new Date();
  const slug = slugify(imported.title);

  await db.insert(dashboards).values({
    id,
    orgId,
    folderId: input.folderId ?? null,
    title: imported.title,
    slug,
    description: imported.description,
    tags: imported.tags,
    panels: imported.panels,
    variables: imported.variables,
    timeRange: imported.timeRange,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const versionId = crypto.randomUUID();
  await db.insert(dashboardVersions).values({
    id: versionId,
    dashboardId: id,
    version: 1,
    data: JSON.stringify({ ...imported, id, orgId, slug, version: 1 }),
    message: `Imported from ${format} format`,
    createdBy: user.email,
    createdAt: now,
  });

  const created = await db.select().from(dashboards).where(eq(dashboards.id, id)).limit(1);

  return c.json({ dashboard: created[0], warnings }, 201);
});

export { app as dashboardImportRoutes };
