import { createDashboardSchema, dashboardListQuerySchema, importDashboardSchema, restoreVersionInputSchema, updateDashboardInputSchema } from '@graflare/shared/schemas/dashboard';
import { createDatasourceSchema, updateDatasourceInputSchema as updateDatasourceInput } from '@graflare/shared/schemas/datasource';
import { createFolderSchema, updateFolderInputSchema } from '@graflare/shared/schemas/folder';
import { dashboardIdSchema, datasourceIdSchema, folderIdSchema } from '@graflare/shared/schemas/ids';
import { prometheusResponseSchema } from '@graflare/shared/schemas/prometheus';
import { proxyQueryInputSchema } from '@graflare/shared/schemas/proxy';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod/mini';
import { env } from 'cloudflare:workers';

export interface DatasourceRow {
  id: string;
  orgId: string;
  name: string;
  type: string;
  url: string;
  authType: string;
  queryTimeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

const toDatasourceRow = (ds: {
  id: string;
  orgId: string;
  name: string;
  type: string;
  url: string;
  authType: string;
  queryTimeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}): DatasourceRow => ({
  id: ds.id,
  orgId: ds.orgId,
  name: ds.name,
  type: ds.type,
  url: ds.url,
  authType: ds.authType,
  queryTimeoutMs: ds.queryTimeoutMs,
  createdAt: ds.createdAt,
  updatedAt: ds.updatedAt,
});

export const listDatasources = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await env.API.listDatasources('default');
  return rows.map(ds => toDatasourceRow(ds));
});

export const getDatasource = createServerFn({ method: 'GET' })
  .inputValidator(datasourceIdSchema)
  .handler(async ({ data: id }) => {
    const ds = await env.API.getDatasource('default', id);
    return ds === null ? null : toDatasourceRow(ds);
  });

export const createDatasource = createServerFn({ method: 'POST' })
  .inputValidator(createDatasourceSchema)
  .handler(async ({ data }) => {
    const ds = await env.API.createDatasource('default', data);
    return {
      id: ds.id,
      orgId: ds.orgId,
      name: ds.name,
      type: ds.type,
      url: ds.url,
      authType: ds.authType,
      queryTimeoutMs: ds.queryTimeoutMs,
      createdAt: ds.createdAt,
      updatedAt: ds.updatedAt,
    };
  });

export const updateDatasource = createServerFn({ method: 'POST' })
  .inputValidator(updateDatasourceInput)
  .handler(async ({ data: { id, data } }) => {
    const ds = await env.API.updateDatasource('default', id, data);
    return ds === null ? null : toDatasourceRow(ds);
  });

export const deleteDatasource = createServerFn({ method: 'POST' })
  .inputValidator(datasourceIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteDatasource('default', id);
  });

export const testConnection = createServerFn({ method: 'POST' })
  .inputValidator(datasourceIdSchema)
  .handler(async ({ data: id }) => {
    const result = await env.API.testConnection('default', id);
    const plain: TestConnectionResult = {
      success: result.success,
      latencyMs: result.latencyMs,
      ...(result.error !== undefined && { error: result.error }),
    };
    return plain;
  });

export const proxyQuery = createServerFn({ method: 'POST' })
  .inputValidator(proxyQueryInputSchema)
  .handler(async ({ data }) => {
    const result = await env.API.proxyQuery('default', data.datasourceId, data.endpoint, data.params);
    return prometheusResponseSchema.parse(result);
  });

// --- Dashboard server functions ---

export const listDashboards = createServerFn({ method: 'GET' })
  .inputValidator(z.optional(dashboardListQuerySchema))
  .handler(async ({ data: opts }) => {
    const rows = await env.API.listDashboards('default', opts);
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
    const d = await env.API.getDashboard('default', id);
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
    const d = await env.API.createDashboard('default', data);
    if (d === null) return null;
    return { id: d.id, title: d.title, slug: d.slug };
  });

export const updateDashboard = createServerFn({ method: 'POST' })
  .inputValidator(updateDashboardInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const d = await env.API.updateDashboard('default', id, data);
    if (d === null) return null;
    return { id: d.id, title: d.title, version: d.version };
  });

export const deleteDashboard = createServerFn({ method: 'POST' })
  .inputValidator(dashboardIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteDashboard('default', id);
  });

export const listDashboardVersions = createServerFn({ method: 'GET' })
  .inputValidator(dashboardIdSchema)
  .handler(async ({ data: id }) => {
    const versions = await env.API.listDashboardVersions('default', id);
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
    const d = await env.API.restoreDashboardVersion('default', dashboardId, version);
    if (d === null) return null;
    return { id: d.id, title: d.title, version: d.version };
  });

export const importDashboard = createServerFn({ method: 'POST' })
  .inputValidator(importDashboardSchema)
  .handler(async ({ data }) => {
    const result = await env.API.importDashboard('default', data);
    const dashboard = result.dashboard === null
      ? null
      : { id: result.dashboard.id, title: result.dashboard.title };
    return { dashboard, warnings: result.warnings };
  });

// --- Folder server functions ---

export const listFolders = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await env.API.listFolders('default');
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
    const f = await env.API.createFolder('default', data);
    return { id: f.id, title: f.title, slug: f.slug };
  });

export const updateFolder = createServerFn({ method: 'POST' })
  .inputValidator(updateFolderInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const f = await env.API.updateFolder('default', id, data);
    if (f === null) return null;
    return { id: f.id, title: f.title, slug: f.slug };
  });

export const deleteFolder = createServerFn({ method: 'POST' })
  .inputValidator(folderIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteFolder('default', id);
  });
