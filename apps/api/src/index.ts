import type { CreateAlertRuleGroup, UpdateAlertRuleGroup } from '@graflare/shared/schemas/alert-rule-group';
import type { CreateAlertRule, UpdateAlertRule } from '@graflare/shared/schemas/alert-rule';
import type { AlertInstanceListQuery, UpsertAlertInstance } from '@graflare/shared/schemas/alert-instance';
import type { CreateContactPoint, UpdateContactPoint } from '@graflare/shared/schemas/contact-point';
import type { CreateNotificationPolicy, UpdateNotificationPolicy } from '@graflare/shared/schemas/notification-policy';
import type { CreateSilence, UpdateSilence } from '@graflare/shared/schemas/silence';
import type { CreateMuteTiming, UpdateMuteTiming } from '@graflare/shared/schemas/mute-timing';
import type { AnnotationListQuery, CreateAnnotation } from '@graflare/shared/schemas/annotation';
import type { CreateDashboard, DashboardListQuery, ImportDashboard, UpdateDashboard } from '@graflare/shared/schemas/dashboard';
import type { CreateDatasource, UpdateDatasource } from '@graflare/shared/schemas/datasource';
import type { CreateFolder, UpdateFolder } from '@graflare/shared/schemas/folder';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';
import type { SqlFormat, SqlResponse } from '@graflare/shared/schemas/sql';

import { createAlertRuleGroupSchema, updateAlertRuleGroupSchema } from '@graflare/shared/schemas/alert-rule-group';
import { createAlertRuleSchema, updateAlertRuleSchema } from '@graflare/shared/schemas/alert-rule';
import { alertInstanceListQuerySchema, upsertAlertInstanceSchema } from '@graflare/shared/schemas/alert-instance';
import { createContactPointSchema, updateContactPointSchema } from '@graflare/shared/schemas/contact-point';
import { createNotificationPolicySchema, updateNotificationPolicySchema } from '@graflare/shared/schemas/notification-policy';
import { createSilenceSchema, updateSilenceSchema } from '@graflare/shared/schemas/silence';
import { createMuteTimingSchema, updateMuteTimingSchema } from '@graflare/shared/schemas/mute-timing';
import { annotationListQuerySchema, createAnnotationSchema } from '@graflare/shared/schemas/annotation';
import { createDashboardSchema, importDashboardSchema, updateDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { createDatasourceSchema, datasourceCredentialsSchema, updateDatasourceSchema } from '@graflare/shared/schemas/datasource';
import { createFolderSchema, updateFolderSchema } from '@graflare/shared/schemas/folder';
import {
  alertRuleGroupIdSchema,
  alertRuleIdSchema,
  annotationIdSchema,
  contactPointIdSchema,
  dashboardIdSchema,
  datasourceIdSchema,
  folderIdSchema,
  muteTimingIdSchema,
  notificationPolicyIdSchema,
  silenceIdSchema,
} from '@graflare/shared/schemas/ids';
import { detectFormat, importDashboard as importDashboardFn } from '@graflare/shared/import';
import { prometheusResponseSchema } from '@graflare/shared/schemas/prometheus';
import { expandSqlMacros } from '@graflare/shared/sql/macros';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte, like, lte } from 'drizzle-orm';
import { Hono } from 'hono';

import type { DurableObjectNamespace } from 'cloudflare:workers';

import type { AlertRuleDO } from './alerting/alert-rule-do';

import { decryptCredentials, encryptCredentials } from './crypto/credentials';
import { createDb } from './db';
import {
  alertInstances,
  alertRuleGroups,
  alertRules,
  annotations,
  contactPoints,
  dashboardVersions,
  dashboards,
  datasources,
  folders,
  muteTimings,
  notificationPolicies,
  silences,
} from './db/schema';
import { accessMiddleware } from './middleware/access';
import { orgMiddleware } from './middleware/org';
import { alertInstanceRoutes } from './routes/alerting/alert-instances';
import { alertRuleGroupRoutes } from './routes/alerting/alert-rule-groups';
import { alertRuleRoutes } from './routes/alerting/alert-rules';
import { annotationRoutes } from './routes/alerting/annotations';
import { contactPointRoutes } from './routes/alerting/contact-points';
import { muteTimingRoutes } from './routes/alerting/mute-timings';
import { notificationPolicyRoutes } from './routes/alerting/notification-policies';
import { silenceRoutes } from './routes/alerting/silences';
import { dashboardImportRoutes } from './routes/dashboards/dashboard-import';
import { dashboardVersionRoutes } from './routes/dashboards/dashboard-versions';
import { dashboardRoutes } from './routes/dashboards/dashboards';
import { datasourceRoutes } from './routes/datasources/datasources';
import { datasourceTestRoutes } from './routes/datasources/datasources-test';
import { folderRoutes } from './routes/folders/folders';
import { proxyRoutes } from './routes/datasources/proxy';
import { createSqlClient } from './sql/factory';

interface Bindings {
  DB: D1Database;
  ENCRYPTION_KEY: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALERT_RULE: DurableObjectNamespace<AlertRuleDO>;
  NOTIFICATION_WORKFLOW: Workflow;
  EMAIL: SendEmail;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    user: { email: string; name: string };
    orgId: string;
  };
}

const TIME_MULTIPLIERS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

const resolveTimeValue = (expr: string): number => {
  if (expr === 'now') return Math.floor(Date.now() / 1000);
  const match = /^now-(\d+)([smhdw])$/.exec(expr);
  if (match !== null) {
    const [, amount, unit] = match;
    if (amount !== undefined && unit !== undefined) {
      const multiplier = TIME_MULTIPLIERS[unit];
      if (multiplier !== undefined) {
        return Math.floor(Date.now() / 1000) - Number(amount) * multiplier;
      }
    }
  }
  const parsed = Number(expr);
  if (!Number.isNaN(parsed)) return parsed;
  return Math.floor(Date.now() / 1000);
};

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
app.route('/api/v1/alert-rule-groups', alertRuleGroupRoutes);
app.route('/api/v1/alert-rules', alertRuleRoutes);
app.route('/api/v1/alert-instances', alertInstanceRoutes);
app.route('/api/v1/contact-points', contactPointRoutes);
app.route('/api/v1/notification-policies', notificationPolicyRoutes);
app.route('/api/v1/silences', silenceRoutes);
app.route('/api/v1/mute-timings', muteTimingRoutes);
app.route('/api/v1/annotations', annotationRoutes);

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
        dialect: datasources.dialect,
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
        dialect: datasources.dialect,
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

    if (ds.type === 'sql') {
      const client = await createSqlClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, id);
      if (client === null) {
        return { success: false, latencyMs: 0, error: 'Not found' };
      }
      return client.testConnection();
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
        return { success: false, latencyMs, error: `Upstream returned ${String(res.status)}` };
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

  // --- SQL RPC ---

  async sqlQuery(
    orgId: string,
    datasourceId: string,
    rawSql: string,
    _format: SqlFormat,
    timeRange?: { from: string; to: string },
  ): Promise<SqlResponse> {
    datasourceIdSchema.parse(datasourceId);

    const rows = await this.db
      .select()
      .from(datasources)
      .where(and(eq(datasources.id, datasourceId), eq(datasources.orgId, orgId)))
      .limit(1);

    const [ds] = rows;
    if (ds === undefined) {
      return { columns: [], rows: [], error: 'Data source not found' };
    }

    if (ds.type !== 'sql') {
      return { columns: [], rows: [], error: 'Data source is not a SQL type' };
    }

    const dialect = ds.dialect === 'postgres' ? 'postgres' : 'sqlite';

    const resolvedTimeRange = {
      from: timeRange ? resolveTimeValue(timeRange.from) : Math.floor(Date.now() / 1000) - 3600,
      to: timeRange ? resolveTimeValue(timeRange.to) : Math.floor(Date.now() / 1000),
    };

    const { sql: expandedSql, params } = expandSqlMacros(rawSql, dialect, resolvedTimeRange);

    const client = await createSqlClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, datasourceId);
    if (client === null) {
      return { columns: [], rows: [], error: 'Data source not found' };
    }

    return client.query(expandedSql, params);
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
      await this.db
        .update(alertRuleGroups)
        .set({ folderId: parentFolderId })
        .where(eq(alertRuleGroups.folderId, id));
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

  // --- Alert Rule Group RPC ---

  async listAlertRuleGroups(orgId: string) {
    return this.db.select().from(alertRuleGroups).where(eq(alertRuleGroups.orgId, orgId));
  }

  async getAlertRuleGroup(orgId: string, id: string) {
    alertRuleGroupIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(alertRuleGroups)
      .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createAlertRuleGroup(orgId: string, input: CreateAlertRuleGroup) {
    const parsed = createAlertRuleGroupSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(alertRuleGroups).values({
      id,
      orgId,
      folderId: parsed.folderId ?? null,
      name: parsed.name,
      evalIntervalS: parsed.evalIntervalS ?? 60,
      createdAt: now,
      updatedAt: now,
    });

    return { id, orgId, folderId: parsed.folderId ?? null, name: parsed.name, evalIntervalS: parsed.evalIntervalS ?? 60, createdAt: now, updatedAt: now };
  }

  async updateAlertRuleGroup(orgId: string, id: string, input: UpdateAlertRuleGroup) {
    alertRuleGroupIdSchema.parse(id);
    const parsed = updateAlertRuleGroupSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.name !== undefined) setData['name'] = parsed.name;
    if (parsed.folderId !== undefined) setData['folderId'] = parsed.folderId;
    if (parsed.evalIntervalS !== undefined) setData['evalIntervalS'] = parsed.evalIntervalS;

    await this.db
      .update(alertRuleGroups)
      .set(setData)
      .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)));

    return this.getAlertRuleGroup(orgId, id);
  }

  async deleteAlertRuleGroup(orgId: string, id: string): Promise<void> {
    alertRuleGroupIdSchema.parse(id);
    await this.db.delete(alertRuleGroups).where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)));
  }

  // --- Alert Rule RPC ---

  async listAlertRules(orgId: string) {
    return this.db.select().from(alertRules).where(eq(alertRules.orgId, orgId));
  }

  async getAlertRule(orgId: string, id: string) {
    alertRuleIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createAlertRule(orgId: string, input: CreateAlertRule) {
    const parsed = createAlertRuleSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(alertRules).values({
      id,
      orgId,
      groupId: parsed.groupId,
      title: parsed.title,
      queries: parsed.queries,
      condition: parsed.condition,
      labels: parsed.labels ?? {},
      annotations: parsed.annotations ?? {},
      forDurationS: parsed.forDurationS ?? 0,
      noDataState: parsed.noDataState ?? 'Alerting',
      execErrState: parsed.execErrState ?? 'Alerting',
      isPaused: parsed.isPaused ?? false,
      createdAt: now,
      updatedAt: now,
    });

    if (!(parsed.isPaused ?? false)) {
      const group = await this.getAlertRuleGroup(orgId, parsed.groupId);
      if (group !== null) {
        const stub = this.env.ALERT_RULE.getByName(id);
        await stub.init({
          orgId,
          ruleId: id,
          queries: parsed.queries,
          condition: parsed.condition,
          evalIntervalS: group.evalIntervalS,
          forDurationS: parsed.forDurationS ?? 0,
          noDataState: parsed.noDataState ?? 'Alerting',
          execErrState: parsed.execErrState ?? 'Alerting',
          labels: parsed.labels ?? {},
          annotations: parsed.annotations ?? {},
        });
      }
    }

    return this.getAlertRule(orgId, id);
  }

  async updateAlertRule(orgId: string, id: string, input: UpdateAlertRule) {
    alertRuleIdSchema.parse(id);
    const parsed = updateAlertRuleSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.groupId !== undefined) setData['groupId'] = parsed.groupId;
    if (parsed.title !== undefined) setData['title'] = parsed.title;
    if (parsed.queries !== undefined) setData['queries'] = parsed.queries;
    if (parsed.condition !== undefined) setData['condition'] = parsed.condition;
    if (parsed.labels !== undefined) setData['labels'] = parsed.labels;
    if (parsed.annotations !== undefined) setData['annotations'] = parsed.annotations;
    if (parsed.forDurationS !== undefined) setData['forDurationS'] = parsed.forDurationS;
    if (parsed.noDataState !== undefined) setData['noDataState'] = parsed.noDataState;
    if (parsed.execErrState !== undefined) setData['execErrState'] = parsed.execErrState;
    if (parsed.isPaused !== undefined) setData['isPaused'] = parsed.isPaused;

    await this.db
      .update(alertRules)
      .set(setData)
      .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));

    return this.getAlertRule(orgId, id);
  }

  async deleteAlertRule(orgId: string, id: string): Promise<void> {
    alertRuleIdSchema.parse(id);
    const stub = this.env.ALERT_RULE.getByName(id);
    await stub.stop();
    await this.db.delete(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));
  }

  // --- Alert Instance RPC ---

  async listAlertInstances(orgId: string, opts?: AlertInstanceListQuery) {
    const parsed = opts ? alertInstanceListQuerySchema.parse(opts) : undefined;
    const conditions = [eq(alertInstances.orgId, orgId)];
    if (parsed?.ruleId !== undefined) conditions.push(eq(alertInstances.ruleId, parsed.ruleId));
    if (parsed?.state !== undefined) conditions.push(eq(alertInstances.state, parsed.state));

    return this.db.select().from(alertInstances).where(and(...conditions));
  }

  async upsertAlertInstances(orgId: string, instances: UpsertAlertInstance[]) {
    for (const inst of instances) {
      const parsed = upsertAlertInstanceSchema.parse(inst);
      const existing = await this.db
        .select({ id: alertInstances.id })
        .from(alertInstances)
        .where(and(eq(alertInstances.ruleId, parsed.ruleId), eq(alertInstances.labelsHash, parsed.labelsHash)))
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(alertInstances)
          .set({
            labels: parsed.labels ?? {},
            state: parsed.state,
            value: parsed.value,
            activeAt: parsed.activeAt !== null ? new Date(parsed.activeAt) : null,
            lastEvalAt: new Date(parsed.lastEvalAt),
          })
          .where(eq(alertInstances.id, existing[0].id));
      } else {
        await this.db.insert(alertInstances).values({
          id: crypto.randomUUID(),
          orgId,
          ruleId: parsed.ruleId,
          labelsHash: parsed.labelsHash,
          labels: parsed.labels ?? {},
          state: parsed.state,
          value: parsed.value,
          activeAt: parsed.activeAt !== null ? new Date(parsed.activeAt) : null,
          lastEvalAt: new Date(parsed.lastEvalAt),
        });
      }
    }
  }

  // --- Contact Point RPC ---

  async listContactPoints(orgId: string) {
    const rows = await this.db.select().from(contactPoints).where(eq(contactPoints.orgId, orgId));
    return rows.map(r => {
      const {settings} = r;
      if (typeof settings === 'object' && settings?.['type'] === 'webhook' && typeof settings['password'] === 'string' && settings['password'].length > 0) {
        return Object.assign(r, { settings: {
	...settings,
	password: '******'
} });
      }
      return r;
    });
  }

  async getContactPoint(orgId: string, id: string) {
    contactPointIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(contactPoints)
      .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
      .limit(1);
    const row = rows[0] ?? null;
    if (row === null) return null;
    const {settings} = row;
    if (typeof settings === 'object' && settings?.['type'] === 'webhook' && typeof settings['password'] === 'string' && settings['password'].length > 0) {
      return { ...row, settings: { ...settings, password: '******' } };
    }
    return row;
  }

  async createContactPoint(orgId: string, input: CreateContactPoint) {
    const parsed = createContactPointSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    let {settings} = parsed;
    if (parsed.settings.type === 'webhook' && parsed.settings.password.length > 0) {
      settings = { ...parsed.settings, password: await encryptCredentials(parsed.settings.password, this.env.ENCRYPTION_KEY) };
    }

    await this.db.insert(contactPoints).values({
      id,
      orgId,
      name: parsed.name,
      type: parsed.type,
      settings,
      createdAt: now,
      updatedAt: now,
    });

    return this.getContactPoint(orgId, id);
  }

  async updateContactPoint(orgId: string, id: string, input: UpdateContactPoint) {
    contactPointIdSchema.parse(id);
    const parsed = updateContactPointSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.name !== undefined) setData['name'] = parsed.name;
    if (parsed.type !== undefined) setData['type'] = parsed.type;
    if (parsed.settings !== undefined) {
      let {settings} = parsed;
      if (parsed.settings.type === 'webhook' && parsed.settings.password.length > 0) {
        settings = { ...parsed.settings, password: await encryptCredentials(parsed.settings.password, this.env.ENCRYPTION_KEY) };
      }
      setData['settings'] = settings;
    }

    await this.db
      .update(contactPoints)
      .set(setData)
      .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));

    return this.getContactPoint(orgId, id);
  }

  async deleteContactPoint(orgId: string, id: string): Promise<void> {
    contactPointIdSchema.parse(id);
    await this.db.delete(contactPoints).where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));
  }

  // --- Notification Policy RPC ---

  async listNotificationPolicies(orgId: string) {
    return this.db.select().from(notificationPolicies).where(eq(notificationPolicies.orgId, orgId));
  }

  async createNotificationPolicy(orgId: string, input: CreateNotificationPolicy) {
    const parsed = createNotificationPolicySchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(notificationPolicies).values({
      id,
      orgId,
      parentId: parsed.parentId ?? null,
      contactPointId: parsed.contactPointId ?? null,
      groupBy: parsed.groupBy ?? ['alertname'],
      matchers: parsed.matchers ?? [],
      muteTimingIds: parsed.muteTimingIds ?? [],
      groupWaitS: parsed.groupWaitS ?? 30,
      groupIntervalS: parsed.groupIntervalS ?? 300,
      repeatIntervalS: parsed.repeatIntervalS ?? 14400,
      continueMatching: parsed.continueMatching ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const rows = await this.db.select().from(notificationPolicies).where(eq(notificationPolicies.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async updateNotificationPolicy(orgId: string, id: string, input: UpdateNotificationPolicy) {
    notificationPolicyIdSchema.parse(id);
    const parsed = updateNotificationPolicySchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.parentId !== undefined) setData['parentId'] = parsed.parentId;
    if (parsed.contactPointId !== undefined) setData['contactPointId'] = parsed.contactPointId;
    if (parsed.groupBy !== undefined) setData['groupBy'] = parsed.groupBy;
    if (parsed.matchers !== undefined) setData['matchers'] = parsed.matchers;
    if (parsed.muteTimingIds !== undefined) setData['muteTimingIds'] = parsed.muteTimingIds;
    if (parsed.groupWaitS !== undefined) setData['groupWaitS'] = parsed.groupWaitS;
    if (parsed.groupIntervalS !== undefined) setData['groupIntervalS'] = parsed.groupIntervalS;
    if (parsed.repeatIntervalS !== undefined) setData['repeatIntervalS'] = parsed.repeatIntervalS;
    if (parsed.continueMatching !== undefined) setData['continueMatching'] = parsed.continueMatching;

    await this.db
      .update(notificationPolicies)
      .set(setData)
      .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));

    const rows = await this.db.select().from(notificationPolicies).where(eq(notificationPolicies.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async deleteNotificationPolicy(orgId: string, id: string): Promise<void> {
    notificationPolicyIdSchema.parse(id);
    await this.db.delete(notificationPolicies).where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));
  }

  // --- Silence RPC ---

  async listSilences(orgId: string) {
    return this.db.select().from(silences).where(eq(silences.orgId, orgId));
  }

  async getSilence(orgId: string, id: string) {
    silenceIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(silences)
      .where(and(eq(silences.id, id), eq(silences.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createSilence(orgId: string, input: CreateSilence) {
    const parsed = createSilenceSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(silences).values({
      id,
      orgId,
      matchers: parsed.matchers,
      startsAt: new Date(parsed.startsAt),
      endsAt: new Date(parsed.endsAt),
      comment: parsed.comment ?? '',
      createdBy: parsed.createdBy ?? '',
      createdAt: now,
      updatedAt: now,
    });

    return this.getSilence(orgId, id);
  }

  async updateSilence(orgId: string, id: string, input: UpdateSilence) {
    silenceIdSchema.parse(id);
    const parsed = updateSilenceSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.matchers !== undefined) setData['matchers'] = parsed.matchers;
    if (parsed.startsAt !== undefined) setData['startsAt'] = new Date(parsed.startsAt);
    if (parsed.endsAt !== undefined) setData['endsAt'] = new Date(parsed.endsAt);
    if (parsed.comment !== undefined) setData['comment'] = parsed.comment;
    if (parsed.createdBy !== undefined) setData['createdBy'] = parsed.createdBy;

    await this.db
      .update(silences)
      .set(setData)
      .where(and(eq(silences.id, id), eq(silences.orgId, orgId)));

    return this.getSilence(orgId, id);
  }

  async deleteSilence(orgId: string, id: string): Promise<void> {
    silenceIdSchema.parse(id);
    await this.db.delete(silences).where(and(eq(silences.id, id), eq(silences.orgId, orgId)));
  }

  // --- Mute Timing RPC ---

  async listMuteTimings(orgId: string) {
    return this.db.select().from(muteTimings).where(eq(muteTimings.orgId, orgId));
  }

  async getMuteTiming(orgId: string, id: string) {
    muteTimingIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(muteTimings)
      .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createMuteTiming(orgId: string, input: CreateMuteTiming) {
    const parsed = createMuteTimingSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(muteTimings).values({
      id,
      orgId,
      name: parsed.name,
      intervals: parsed.intervals ?? [],
      createdAt: now,
      updatedAt: now,
    });

    return this.getMuteTiming(orgId, id);
  }

  async updateMuteTiming(orgId: string, id: string, input: UpdateMuteTiming) {
    muteTimingIdSchema.parse(id);
    const parsed = updateMuteTimingSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.name !== undefined) setData['name'] = parsed.name;
    if (parsed.intervals !== undefined) setData['intervals'] = parsed.intervals;

    await this.db
      .update(muteTimings)
      .set(setData)
      .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));

    return this.getMuteTiming(orgId, id);
  }

  async deleteMuteTiming(orgId: string, id: string): Promise<void> {
    muteTimingIdSchema.parse(id);
    await this.db.delete(muteTimings).where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));
  }

  // --- Annotation RPC ---

  async listAnnotations(orgId: string, opts?: AnnotationListQuery) {
    const parsed = opts ? annotationListQuerySchema.parse(opts) : undefined;
    const conditions = [eq(annotations.orgId, orgId)];

    if (parsed?.dashboardId !== undefined) conditions.push(eq(annotations.dashboardId, parsed.dashboardId));
    if (parsed?.alertRuleId !== undefined) conditions.push(eq(annotations.alertRuleId, parsed.alertRuleId));
    if (parsed?.from !== undefined) conditions.push(gte(annotations.time, new Date(parsed.from)));
    if (parsed?.to !== undefined) conditions.push(lte(annotations.time, new Date(parsed.to)));

    let rows = await this.db.select().from(annotations).where(and(...conditions));

    if (parsed?.tag !== undefined) {
      const { tag } = parsed;
      rows = rows.filter(r => r.tags.includes(tag));
    }

    return rows;
  }

  async createAnnotation(orgId: string, input: CreateAnnotation) {
    const parsed = createAnnotationSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(annotations).values({
      id,
      orgId,
      dashboardId: parsed.dashboardId,
      panelId: parsed.panelId,
      alertRuleId: parsed.alertRuleId,
      time: new Date(parsed.time),
      timeEnd: parsed.timeEnd !== undefined ? new Date(parsed.timeEnd) : undefined,
      text: parsed.text,
      tags: parsed.tags ?? [],
      prevState: parsed.prevState,
      newState: parsed.newState,
      createdAt: now,
    });

    const rows = await this.db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async deleteAnnotation(orgId: string, id: string): Promise<void> {
    annotationIdSchema.parse(id);
    await this.db.delete(annotations).where(and(eq(annotations.id, id), eq(annotations.orgId, orgId)));
  }
}

export { AlertRuleDO } from './alerting/alert-rule-do';
export { NotificationWorkflow } from './alerting/notification-workflow';
