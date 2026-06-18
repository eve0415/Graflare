import type { Database } from '../../db';
import type { CreateFolder, UpdateFolder } from '@graflare/shared/schemas/folder';

import { createFolderSchema, updateFolderSchema } from '@graflare/shared/schemas/folder';
import { folderIdSchema } from '@graflare/shared/schemas/ids';
import { and, eq } from 'drizzle-orm';

import { alertRuleGroups, dashboards, folders } from '../../db/schema';
import { slugify } from '../../slugify';

// Shared folder CRUD used by BOTH the Hono route and the RPC method. Org-scoped; delete cascades
// (re-parents children/dashboards/alert-rule-groups, then removes the folder) in one atomic batch.
type FolderRow = typeof folders.$inferSelect;

export const listFolders = (db: Database, orgId: string): Promise<FolderRow[]> => db.select().from(folders).where(eq(folders.orgId, orgId));

const getFolder = async (db: Database, orgId: string, id: string): Promise<FolderRow | null> => {
  const rows = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

// Returns the created row (non-null — the create contract both surfaces relied on).
export const createFolder = async (db: Database, orgId: string, input: CreateFolder): Promise<FolderRow> => {
  const parsed = createFolderSchema.parse(input);
  const id = crypto.randomUUID();
  const now = new Date();
  const slug = slugify(parsed.title);
  try {
    await db.insert(folders).values({ id, orgId, parentId: parsed.parentId ?? null, title: parsed.title, slug, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error('createFolder failed:', error);
    throw new Error('Failed to create folder', { cause: error });
  }
  const created = await getFolder(db, orgId, id);
  if (created === null) throw new Error('Failed to create folder: row missing after insert');
  return created;
};

export const updateFolder = async (db: Database, orgId: string, id: string, input: UpdateFolder): Promise<FolderRow | null> => {
  folderIdSchema.parse(id);
  const parsed = updateFolderSchema.parse(input);
  const now = new Date();
  const setData: Record<string, unknown> = { updatedAt: now };
  if (parsed.title !== undefined) {
    setData['title'] = parsed.title;
    setData['slug'] = slugify(parsed.title);
  }
  if (parsed.parentId !== undefined) setData['parentId'] = parsed.parentId;
  try {
    await db
      .update(folders)
      .set(setData)
      .where(and(eq(folders.id, id), eq(folders.orgId, orgId)));
  } catch (error) {
    console.error('updateFolder failed:', error);
    throw new Error('Failed to update folder', { cause: error });
  }
  return getFolder(db, orgId, id);
};

// Returns false when no row was found for this org (route → 404; RPC ignores it, resolves void).
export const deleteFolder = async (db: Database, orgId: string, id: string): Promise<boolean> => {
  folderIdSchema.parse(id);
  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
    .limit(1);
  const [found] = existing;
  if (found === undefined) return false;
  try {
    const { parentId: parentFolderId } = found;
    // One atomic batch — a failure mid-way must not leave children re-parented while the folder
    // still exists.
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
  } catch (error) {
    console.error('deleteFolder failed:', error);
    throw new Error('Failed to delete folder', { cause: error });
  }
  return true;
};
