import type { Database } from '../../db';
import type { CreateDashboard, DashboardListQuery, UpdateDashboard } from '@graflare/shared/schemas/dashboard';

import { createDashboardSchema, updateDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { dashboardIdSchema } from '@graflare/shared/schemas/ids';
import { and, eq, like, sql } from 'drizzle-orm';

import { dashboardVersions, dashboards } from '../../db/schema';
import { pickDefined } from '../../pick-defined';
import { slugify } from '../../slugify';

// Shared dashboard CRUD used by BOTH the Hono route and the RPC method. Create/update write the
// dashboard and its version row in one atomic batch (an update can never land without its version,
// and the version number is incremented DB-side so concurrent saves can't collide).
type DashboardRow = typeof dashboards.$inferSelect;

const publicColumns = {
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
};

export const listDashboards = (db: Database, orgId: string, opts?: DashboardListQuery) => {
  const conditions = [eq(dashboards.orgId, orgId)];
  if (opts?.folderId !== undefined) conditions.push(eq(dashboards.folderId, opts.folderId));
  if (opts?.search !== undefined) conditions.push(like(dashboards.title, `%${opts.search}%`));
  // Push tag filtering into SQLite (json_each over the tags JSON array) instead of fetching the
  // whole org's dashboards and filtering in JS.
  if (opts?.tag !== undefined) conditions.push(sql`exists (select 1 from json_each(${dashboards.tags}) where value = ${opts.tag})`);
  return db
    .select(publicColumns)
    .from(dashboards)
    .where(and(...conditions));
};

export const getDashboard = async (db: Database, orgId: string, id: string): Promise<DashboardRow | null> => {
  dashboardIdSchema.parse(id);
  const rows = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

export const createDashboard = async (db: Database, orgId: string, input: CreateDashboard, createdBy: string): Promise<DashboardRow | null> => {
  const parsed = createDashboardSchema.parse(input);
  const id = crypto.randomUUID();
  const now = new Date();
  const slug = slugify(parsed.title);
  try {
    await db.batch([
      db.insert(dashboards).values({
        id,
        orgId,
        folderId: parsed.folderId ?? null,
        title: parsed.title,
        slug,
        description: parsed.description ?? '',
        tags: parsed.tags ?? [],
        panels: parsed.panels ?? [],
        variables: parsed.variables ?? [],
        timeRange: parsed.timeRange ?? { from: 'now-1h', to: 'now', refresh: null },
        version: 1,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(dashboardVersions).values({
        id: crypto.randomUUID(),
        dashboardId: id,
        version: 1,
        data: JSON.stringify({ ...parsed, id, orgId, slug, version: 1 }),
        message: 'Initial version',
        createdBy,
        createdAt: now,
      }),
    ]);
  } catch (error) {
    console.error('createDashboard failed:', error);
    throw new Error('Failed to create dashboard', { cause: error });
  }
  return getDashboard(db, orgId, id);
};

export const updateDashboard = async (db: Database, orgId: string, id: string, input: UpdateDashboard, createdBy: string): Promise<DashboardRow | null> => {
  dashboardIdSchema.parse(id);
  const parsed = updateDashboardSchema.parse(input);

  const existing = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);
  const [current] = existing;
  if (current === undefined) return null;

  const now = new Date();
  const { message, ...updates } = parsed;
  const changes = {
    ...pickDefined(updates, ['folderId', 'description', 'tags', 'panels', 'variables', 'timeRange']),
    ...(updates.title !== undefined && { title: updates.title, slug: slugify(updates.title) }),
  };
  try {
    // One atomic batch — the version row's `version` reads the post-UPDATE value via subselect so
    // concurrent saves can't collide on it (the JSON snapshot may lag one save behind in that race).
    await db.batch([
      db
        .update(dashboards)
        .set({ ...changes, updatedAt: now, version: sql`version + 1` })
        .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId))),
      db.insert(dashboardVersions).values({
        id: crypto.randomUUID(),
        dashboardId: id,
        version: sql`(select version from ${dashboards} where ${dashboards.id} = ${id})`,
        data: JSON.stringify({ ...current, ...changes, version: current.version + 1, updatedAt: now }),
        message: message ?? '',
        createdBy,
        createdAt: now,
      }),
    ]);
  } catch (error) {
    console.error('updateDashboard failed:', error);
    throw new Error('Failed to update dashboard', { cause: error });
  }
  return getDashboard(db, orgId, id);
};

// Returns false when no row was found for this org (route → 404; RPC ignores it, resolves void).
export const deleteDashboard = async (db: Database, orgId: string, id: string): Promise<boolean> => {
  dashboardIdSchema.parse(id);
  const existing = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  try {
    await db.delete(dashboards).where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)));
  } catch (error) {
    console.error('deleteDashboard failed:', error);
    throw new Error('Failed to delete dashboard', { cause: error });
  }
  return true;
};
