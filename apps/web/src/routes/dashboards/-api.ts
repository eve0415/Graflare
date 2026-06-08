import { annotationSchema } from '@graflare/shared/schemas/annotation';
import {
  createDashboardSchema,
  dashboardListQuerySchema,
  importDashboardSchema,
  restoreVersionInputSchema,
  updateDashboardInputSchema,
} from '@graflare/shared/schemas/dashboard';
import { createFolderSchema, updateFolderInputSchema } from '@graflare/shared/schemas/folder';
import { dashboardIdSchema, folderIdSchema } from '@graflare/shared/schemas/ids';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import * as z from 'zod/mini';

import { getAccessJwt } from '../../lib/auth';

// `from`/`to` are epoch MILLISECONDS: the API's listAnnotations builds its bounds
// with `new Date(from)`, which interprets the number as ms. (Callers resolve the
// dashboard time range to epoch seconds, so they must multiply by 1000.)
const annotationsInputSchema = z.object({
  dashboardId: z.uuid(),
  from: z.int(),
  to: z.int(),
});

export const listDashboards = createServerFn({ method: 'GET' })
  .inputValidator(z.optional(dashboardListQuerySchema))
  .handler(async ({ data: opts }) => {
    const rows = await env.API.listDashboards(getAccessJwt(), opts);
    return rows.map(d => ({
      id: d.id,
      orgId: d.orgId,
      folderId: d.folderId,
      title: d.title,
      slug: d.slug,
      description: d.description,
      tags: d.tags,
      version: d.version,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  });

export const getDashboard = createServerFn({ method: 'GET' })
  .inputValidator(dashboardIdSchema)
  .handler(async ({ data: id }) => {
    const d = await env.API.getDashboard(getAccessJwt(), id);
    if (d === null) return null;
    return {
      id: d.id,
      orgId: d.orgId,
      folderId: d.folderId,
      title: d.title,
      slug: d.slug,
      description: d.description,
      tags: d.tags,
      panels: d.panels,
      variables: d.variables,
      timeRange: d.timeRange,
      version: d.version,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  });

export const createDashboard = createServerFn({ method: 'POST' })
  .inputValidator(createDashboardSchema)
  .handler(async ({ data }) => {
    const d = await env.API.createDashboard(getAccessJwt(), data);
    if (d === null) return null;
    return { id: d.id, title: d.title, slug: d.slug };
  });

export const updateDashboard = createServerFn({ method: 'POST' })
  .inputValidator(updateDashboardInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const d = await env.API.updateDashboard(getAccessJwt(), id, data);
    if (d === null) return null;
    return { id: d.id, title: d.title, version: d.version };
  });

export const deleteDashboard = createServerFn({ method: 'POST' })
  .inputValidator(dashboardIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteDashboard(getAccessJwt(), id);
  });

export const listDashboardVersions = createServerFn({ method: 'GET' })
  .inputValidator(dashboardIdSchema)
  .handler(async ({ data: id }) => {
    const versions = await env.API.listDashboardVersions(getAccessJwt(), id);
    return versions.map(v => ({
      id: v.id,
      dashboardId: v.dashboardId,
      version: v.version,
      message: v.message,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
    }));
  });

export const restoreDashboardVersion = createServerFn({ method: 'POST' })
  .inputValidator(restoreVersionInputSchema)
  .handler(async ({ data: { dashboardId, version } }) => {
    const d = await env.API.restoreDashboardVersion(getAccessJwt(), dashboardId, version);
    if (d === null) return null;
    return { id: d.id, title: d.title, version: d.version };
  });

export const importDashboard = createServerFn({ method: 'POST' })
  .inputValidator(importDashboardSchema)
  .handler(async ({ data }) => {
    const result = await env.API.importDashboard(getAccessJwt(), data);
    const dashboard = result.dashboard === null ? null : { id: result.dashboard.id, title: result.dashboard.title };
    return { dashboard, warnings: result.warnings };
  });

export const listAnnotations = createServerFn({ method: 'GET' })
  .inputValidator(annotationsInputSchema)
  .handler(async ({ data: { dashboardId, from, to } }) => {
    const rows = await env.API.listAnnotations(getAccessJwt(), { dashboardId, from, to });
    // The RPC returns Drizzle rows: `time`/`timeEnd`/`createdAt` are Dates and the
    // optional columns are `null`. Re-shape to the shared schema's contract — epoch
    // ms numbers, optionals as `undefined` not `null` — and parse to drop the
    // Disposable brand that createServerFn's serialization check rejects.
    return rows.map(r =>
      annotationSchema.parse({
        id: r.id,
        orgId: r.orgId,
        dashboardId: r.dashboardId ?? undefined,
        panelId: r.panelId ?? undefined,
        alertRuleId: r.alertRuleId ?? undefined,
        time: r.time.getTime(),
        timeEnd: r.timeEnd === null ? undefined : r.timeEnd.getTime(),
        text: r.text,
        tags: r.tags,
        prevState: r.prevState ?? undefined,
        newState: r.newState ?? undefined,
        createdAt: r.createdAt.getTime(),
      }),
    );
  });

export const listFolders = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await env.API.listFolders(getAccessJwt());
  return rows.map(f => ({
    id: f.id,
    orgId: f.orgId,
    parentId: f.parentId,
    title: f.title,
    slug: f.slug,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
});

export const createFolder = createServerFn({ method: 'POST' })
  .inputValidator(createFolderSchema)
  .handler(async ({ data }) => {
    const f = await env.API.createFolder(getAccessJwt(), data);
    return { id: f.id, title: f.title, slug: f.slug };
  });

export const updateFolder = createServerFn({ method: 'POST' })
  .inputValidator(updateFolderInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const f = await env.API.updateFolder(getAccessJwt(), id, data);
    if (f === null) return null;
    return { id: f.id, title: f.title, slug: f.slug };
  });

export const deleteFolder = createServerFn({ method: 'POST' })
  .inputValidator(folderIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteFolder(getAccessJwt(), id);
  });
