import type { AppEnv } from '../../index';

import { createFolderSchema, folderIdParamSchema, updateFolderSchema } from '@graflare/shared/schemas/folder';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { alertRuleGroups, dashboards, folders } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';
import { slugify } from '../../slugify';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(folders).where(eq(folders.orgId, orgId));
  return c.json(rows);
});

app.post('/', sValidator('json', createFolderSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { title, parentId } = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();
  const slug = slugify(title);

  await db.insert(folders).values({
    id,
    orgId,
    parentId: parentId ?? null,
    title,
    slug,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, orgId, parentId: parentId ?? null, title, slug, createdAt: now, updatedAt: now }, 201);
});

app.put('/:id', sValidator('param', folderIdParamSchema, onValidationError), sValidator('json', updateFolderSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.title !== undefined) {
    updates['title'] = data.title;
    updates['slug'] = slugify(data.title);
  }
  if (data.parentId !== undefined) {
    updates['parentId'] = data.parentId;
  }

  await db
    .update(folders)
    .set(updates)
    .where(and(eq(folders.id, id), eq(folders.orgId, orgId)));

  const updated = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
    .limit(1);
  return c.json(updated[0]);
});

app.delete('/:id', sValidator('param', folderIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
    .limit(1);

  const [found] = existing;
  if (found === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }

  // One atomic batch, mirroring the RPC path — a failure mid-way must not
  // leave children re-parented while the folder still exists.
  const { parentId: parentFolderId } = found;
  await db.batch([
    db
      .update(folders)
      .set({ parentId: parentFolderId })
      .where(and(eq(folders.parentId, id), eq(folders.orgId, orgId))),
    db
      .update(dashboards)
      .set({ folderId: parentFolderId })
      .where(and(eq(dashboards.folderId, id), eq(dashboards.orgId, orgId))),
    db
      .update(alertRuleGroups)
      .set({ folderId: parentFolderId })
      .where(and(eq(alertRuleGroups.folderId, id), eq(alertRuleGroups.orgId, orgId))),
    db.delete(folders).where(and(eq(folders.id, id), eq(folders.orgId, orgId))),
  ]);

  return c.body(null, 204);
});

export { app as folderRoutes };
