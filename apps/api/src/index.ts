import type { CreateDashboard, DashboardListQuery, ImportDashboard, UpdateDashboard } from '@graflare/shared/schemas/dashboard';
import type { CreateDatasource, UpdateDatasource } from '@graflare/shared/schemas/datasource';
import type { CreateFolder, UpdateFolder } from '@graflare/shared/schemas/folder';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';

import { createDashboardSchema, importDashboardSchema, updateDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { createDatasourceSchema, datasourceCredentialsSchema, updateDatasourceSchema } from '@graflare/shared/schemas/datasource';
import { createFolderSchema, updateFolderSchema } from '@graflare/shared/schemas/folder';
import { dashboardIdSchema, datasourceIdSchema, folderIdSchema } from '@graflare/shared/schemas/ids';
import { detectFormat, importDashboard as importDashboardFn } from '@graflare/shared/import';
import { prometheusResponseSchema } from '@graflare/shared/schemas/prometheus';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, like } from 'drizzle-orm';
import { Hono } from 'hono';

import { decryptCredentials, encryptCredentials } from './crypto/credentials';
import { createDb } from './db';
import { dashboardVersions, dashboards, datasources, folders } from './db/schema';
import { accessMiddleware } from './middleware/access';
import { orgMiddleware } from './middleware/org';
import { dashboardImportRoutes } from './routes/dashboards/dashboard-import';
import { dashboardVersionRoutes } from './routes/dashboards/dashboard-versions';
import { dashboardRoutes } from './routes/dashboards/dashboards';
import { datasourceRoutes } from './routes/datasources/datasources';
import { datasourceTestRoutes } from './routes/datasources/datasources-test';
import { folderRoutes } from './routes/folders';
import { proxyRoutes } from './routes/datasources/proxy';

interface Bindings {
  DB: D1Database;
  ENCRYPTION_KEY: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    user: { email: string; name: string };
    orgId: string;
  };
}

const app = new Hono<AppEnv>();

app.get('/health', c => c.json({ status: 'ok' }));

app.use('/api/*', accessMiddleware());
app.use('/api/*', orgMiddleware());
app.route('/api/v1/datasources', datasourceRoutes);
app.route('/api/v1/datasources', datasourceTestRoutes);
app.route('/api/v1/datasources', proxyRoutes);
app.route('/api/v1/folders', folderRoutes);
app.route('/api/v1/dashboards', dashboardRoutes);
app.route('/api/v1/dashboards', dashboardVersionRoutes);
app.route('/api/v1/dashboards/import', dashboardImportRoutes);

export default app;

export class GraflareAPI extends WorkerEntrypoint<Bindings> {
  private get db() {
    return createDb(this.env.DB);
  }

  health(): Promise<{ status: string }> {
    return Promise.resolve({ status: 'ok' });
  }

  async listDatasources(orgId: string) {
    return this.db
      .select({
        id: datasources.id,
        orgId: datasources.orgId,
        name: datasources.name,
        type: datasources.type,
        url: datasources.url,
        authType: datasources.authType,
        queryTimeoutMs: datasources.queryTimeoutMs,
        createdAt: datasources.createdAt,
        updatedAt: datasources.updatedAt,
      })
      .from(datasources)
      .where(eq(datasources.orgId, orgId));
  }

  async getDatasource(orgId: string, id: string) {
    datasourceIdSchema.parse(id);
    const rows = await this.db
      .select({
        id: datasources.id,
        orgId: datasources.orgId,
        name: datasources.name,
        type: datasources.type,
        url: datasources.url,
        authType: datasources.authType,
        queryTimeoutMs: datasources.queryTimeoutMs,
        createdAt: datasources.createdAt,
        updatedAt: datasources.updatedAt,
      })
      .from(datasources)
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createDatasource(orgId: string, input: CreateDatasource) {
    const parsed = createDatasourceSchema.parse(input);
    const { credentials, ...rest } = parsed;
    const id = crypto.randomUUID();
    const now = new Date();

    let encryptedCreds: string | null = null;
    if (credentials) {
      encryptedCreds = await encryptCredentials(JSON.stringify(credentials), this.env.ENCRYPTION_KEY);
    }

    await this.db.insert(datasources).values({
      id,
      orgId,
      ...rest,
      credentials: encryptedCreds,
      createdAt: now,
      updatedAt: now,
    });

    return { id, orgId, ...rest, createdAt: now, updatedAt: now };
  }

  async updateDatasource(orgId: string, id: string, input: UpdateDatasource) {
    datasourceIdSchema.parse(id);
    const parsed = updateDatasourceSchema.parse(input);
    const { credentials, ...rest } = parsed;
    const now = new Date();

    let encryptedCreds: string | undefined;
    if (credentials) {
      encryptedCreds = await encryptCredentials(JSON.stringify(credentials), this.env.ENCRYPTION_KEY);
    }

    await this.db
      .update(datasources)
      .set({
        ...rest,
        ...(encryptedCreds !== undefined && { credentials: encryptedCreds }),
        updatedAt: now,
      })
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)));

    return this.getDatasource(orgId, id);
  }

  async deleteDatasource(orgId: string, id: string): Promise<void> {
    datasourceIdSchema.parse(id);
    await this.db.delete(datasources).where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)));
  }

  async testConnection(orgId: string, id: string): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    datasourceIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(datasources)
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
      .limit(1);

    const [ds] = rows;
    if (ds === undefined) {
      return { success: false, latencyMs: 0, error: 'Not found' };
    }

    const start = Date.now();

    try {
      const headers: Record<string, string> = {};
      if (ds.credentials) {
        const creds = datasourceCredentialsSchema.parse(JSON.parse(await decryptCredentials(ds.credentials, this.env.ENCRYPTION_KEY)));
        if (ds.authType === 'basic' && creds.username !== undefined && creds.password !== undefined) {
          headers['Authorization'] = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
        } else if (ds.authType === 'bearer' && creds.token !== undefined) {
          headers['Authorization'] = `Bearer ${creds.token}`;
        }
      }

      const res = await fetch(`${ds.url}/api/v1/labels?limit=1`, {
        headers,
        signal: AbortSignal.timeout(ds.queryTimeoutMs),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { success: false, latencyMs, error: `Upstream returned ${res.status}` };
      }
      return { success: true, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, latencyMs, error: message };
    }
  }

  private static ALLOWED_ENDPOINTS = new Set(['/api/v1/query', '/api/v1/query_range', '/api/v1/labels', '/api/v1/series']);

  async proxyQuery(orgId: string, datasourceId: string, endpoint: string, params: Record<string, string>): Promise<PrometheusResponse> {
    datasourceIdSchema.parse(datasourceId);
    if (!GraflareAPI.ALLOWED_ENDPOINTS.has(endpoint) && !endpoint.startsWith('/api/v1/label/')) {
      return { status: 'error', errorType: 'bad_request', error: 'Invalid endpoint' };
    }

    const rows = await this.db
      .select()
      .from(datasources)
      .where(and(eq(datasources.id, datasourceId), eq(datasources.orgId, orgId)))
      .limit(1);

    const [ds] = rows;
    if (ds === undefined) {
      return { status: 'error', errorType: 'not_found', error: 'Data source not found' };
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };

    try {
      const base = new URL(ds.url);
      base.pathname = base.pathname.replace(/\/$/, '') + endpoint;
      const isPost = endpoint.includes('/query');

      const targetUrl = isPost ? base.toString() : `${base.toString()}?${new URLSearchParams(params).toString()}`;

      if (new URL(targetUrl).origin !== base.origin) {
        return { status: 'error', errorType: 'bad_request', error: 'URL origin mismatch' };
      }

      // Attach credentials only after confirming the target origin matches the datasource.
      if (ds.credentials) {
        const creds = datasourceCredentialsSchema.parse(JSON.parse(await decryptCredentials(ds.credentials, this.env.ENCRYPTION_KEY)));
        if (ds.authType === 'basic' && creds.username !== undefined && creds.password !== undefined) {
          headers['Authorization'] = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
        } else if (ds.authType === 'bearer' && creds.token !== undefined) {
          headers['Authorization'] = `Bearer ${creds.token}`;
        }
      }

      const res = await fetch(targetUrl, {
        method: isPost ? 'POST' : 'GET',
        headers,
        ...(isPost && { body: new URLSearchParams(params).toString() }),
        signal: AbortSignal.timeout(ds.queryTimeoutMs),
      });

      return prometheusResponseSchema.parse(await res.json());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Query failed';
      return { status: 'error', errorType: 'timeout', error: message };
    }
  }

  // --- Folder RPC ---

  async listFolders(orgId: string) {
    return this.db.select().from(folders).where(eq(folders.orgId, orgId));
  }

  async createFolder(orgId: string, input: CreateFolder) {
    const parsed = createFolderSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();
    const slug = parsed.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

    await this.db.insert(folders).values({
      id,
      orgId,
      parentId: parsed.parentId ?? null,
      title: parsed.title,
      slug,
      createdAt: now,
      updatedAt: now,
    });

    return { id, orgId, parentId: parsed.parentId ?? null, title: parsed.title, slug, createdAt: now, updatedAt: now };
  }

  async updateFolder(orgId: string, id: string, input: UpdateFolder) {
    folderIdSchema.parse(id);
    const parsed = updateFolderSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.title !== undefined) {
      setData['title'] = parsed.title;
      setData['slug'] = parsed.title
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replaceAll(/^-|-$/g, '');
    }
    if (parsed.parentId !== undefined) setData['parentId'] = parsed.parentId;

    await this.db
      .update(folders)
      .set(setData)
      .where(and(eq(folders.id, id), eq(folders.orgId, orgId)));

    const rows = await this.db
      .select()
      .from(folders)
      .where(eq(folders.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async deleteFolder(orgId: string, id: string): Promise<void> {
    folderIdSchema.parse(id);
    const existing = await this.db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
      .limit(1);

    const [found] = existing;
    if (found !== undefined) {
      const { parentId: parentFolderId } = found;
      await this.db
        .update(folders)
        .set({ parentId: parentFolderId })
        .where(and(eq(folders.parentId, id), eq(folders.orgId, orgId)));
      await this.db
        .update(dashboards)
        .set({ folderId: parentFolderId })
        .where(eq(dashboards.folderId, id));
      await this.db.delete(folders).where(eq(folders.id, id));
    }
  }

  // --- Dashboard RPC ---

  async listDashboards(orgId: string, opts?: DashboardListQuery) {
    const conditions = [eq(dashboards.orgId, orgId)];

    if (opts?.folderId !== undefined) conditions.push(eq(dashboards.folderId, opts.folderId));
    if (opts?.search !== undefined) conditions.push(like(dashboards.title, `%${opts.search}%`));

    let rows = await this.db
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

    if (opts?.tag !== undefined) {
      const {tag} = opts;
      rows = rows.filter(r => r.tags.includes(tag));
    }

    return rows;
  }

  async getDashboard(orgId: string, id: string) {
    dashboardIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createDashboard(orgId: string, input: CreateDashboard, userEmail = '') {
    const parsed = createDashboardSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();
    const slug = parsed.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

    await this.db.insert(dashboards).values({
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
    });

    const versionId = crypto.randomUUID();
    await this.db.insert(dashboardVersions).values({
      id: versionId,
      dashboardId: id,
      version: 1,
      data: JSON.stringify({ ...parsed, id, orgId, slug, version: 1 }),
      message: 'Initial version',
      createdBy: userEmail,
      createdAt: now,
    });

    return this.getDashboard(orgId, id);
  }

  async updateDashboard(orgId: string, id: string, input: UpdateDashboard, userEmail = '') {
    dashboardIdSchema.parse(id);
    const parsed = updateDashboardSchema.parse(input);

    const existing = await this.db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
      .limit(1);

    const [current] = existing;
    if (current === undefined) return null;

    const now = new Date();
    const newVersion = current.version + 1;
    const { message, ...updates } = parsed;

    const setData: Record<string, unknown> = { updatedAt: now, version: newVersion };
    if (updates.title !== undefined) {
      setData['title'] = updates.title;
      setData['slug'] = updates.title
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replaceAll(/^-|-$/g, '');
    }
    if (updates.folderId !== undefined) setData['folderId'] = updates.folderId;
    if (updates.description !== undefined) setData['description'] = updates.description;
    if (updates.tags !== undefined) setData['tags'] = updates.tags;
    if (updates.panels !== undefined) setData['panels'] = updates.panels;
    if (updates.variables !== undefined) setData['variables'] = updates.variables;
    if (updates.timeRange !== undefined) setData['timeRange'] = updates.timeRange;

    await this.db.update(dashboards).set(setData).where(eq(dashboards.id, id));

    const updated = await this.db.select().from(dashboards).where(eq(dashboards.id, id)).limit(1);

    const versionId = crypto.randomUUID();
    await this.db.insert(dashboardVersions).values({
      id: versionId,
      dashboardId: id,
      version: newVersion,
      data: JSON.stringify(updated[0]),
      message: message ?? '',
      createdBy: userEmail,
      createdAt: now,
    });

    return updated[0] ?? null;
  }

  async deleteDashboard(orgId: string, id: string): Promise<void> {
    dashboardIdSchema.parse(id);
    await this.db.delete(dashboards).where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)));
  }

  // --- Dashboard Version RPC ---

  async listDashboardVersions(orgId: string, dashboardId: string) {
    dashboardIdSchema.parse(dashboardId);
    const dashboard = await this.db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.orgId, orgId)))
      .limit(1);

    if (dashboard.length === 0) return [];

    return this.db
      .select({
        id: dashboardVersions.id,
        dashboardId: dashboardVersions.dashboardId,
        version: dashboardVersions.version,
        message: dashboardVersions.message,
        createdBy: dashboardVersions.createdBy,
        createdAt: dashboardVersions.createdAt,
      })
      .from(dashboardVersions)
      .where(eq(dashboardVersions.dashboardId, dashboardId))
      .orderBy(desc(dashboardVersions.version));
  }

  async getDashboardVersion(orgId: string, dashboardId: string, version: number) {
    dashboardIdSchema.parse(dashboardId);
    const dashboard = await this.db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.orgId, orgId)))
      .limit(1);

    if (dashboard.length === 0) return null;

    const rows = await this.db
      .select()
      .from(dashboardVersions)
      .where(and(eq(dashboardVersions.dashboardId, dashboardId), eq(dashboardVersions.version, version)))
      .limit(1);

    return rows[0] ?? null;
  }

  async restoreDashboardVersion(orgId: string, dashboardId: string, version: number, userEmail = '') {
    dashboardIdSchema.parse(dashboardId);

    const existing = await this.db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.orgId, orgId)))
      .limit(1);

    if (existing.length === 0) return null;

    const versionRows = await this.db
      .select()
      .from(dashboardVersions)
      .where(and(eq(dashboardVersions.dashboardId, dashboardId), eq(dashboardVersions.version, version)))
      .limit(1);

    const [versionRow] = versionRows;
    if (versionRow === undefined) return null;

    const snapshotData: unknown = JSON.parse(versionRow.data);
    if (typeof snapshotData !== 'object' || snapshotData === null) return null;

    const snapshot = snapshotData;
    const [current] = existing;
    if (current === undefined) return null;
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

    await this.db.update(dashboards).set(restoreFields).where(eq(dashboards.id, dashboardId));

    const updated = await this.db.select().from(dashboards).where(eq(dashboards.id, dashboardId)).limit(1);

    const versionId = crypto.randomUUID();
    await this.db.insert(dashboardVersions).values({
      id: versionId,
      dashboardId,
      version: newVersion,
      data: JSON.stringify(updated[0]),
      message: `Restored from version ${version}`,
      createdBy: userEmail,
      createdAt: now,
    });

    return updated[0] ?? null;
  }

  async importDashboard(orgId: string, input: ImportDashboard, userEmail = '') {
    const parsed = importDashboardSchema.parse(input);

    const format = parsed.format ?? detectFormat(parsed.json);
    const { dashboard: imported, warnings } = importDashboardFn(parsed.json, format);

    const dashboard = await this.createDashboard(
      orgId,
      {
        title: imported.title,
        folderId: parsed.folderId ?? null,
        description: imported.description,
        tags: imported.tags,
        panels: imported.panels,
        variables: imported.variables,
        timeRange: imported.timeRange,
      },
      userEmail,
    );

    return { dashboard, warnings };
  }
}
