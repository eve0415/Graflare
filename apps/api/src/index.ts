import type { AlertRuleDO } from './alerting/alert-rule-do';
import type { AlertInstanceListQuery, UpsertAlertInstance } from '@graflare/shared/schemas/alert-instance';
import type { CreateAlertRule, UpdateAlertRule } from '@graflare/shared/schemas/alert-rule';
import type { CreateAlertRuleGroup, UpdateAlertRuleGroup } from '@graflare/shared/schemas/alert-rule-group';
import type { AnnotationListQuery, CreateAnnotation } from '@graflare/shared/schemas/annotation';
import type { CreateContactPoint, UpdateContactPoint } from '@graflare/shared/schemas/contact-point';
import type { CreateDashboard, DashboardListQuery, ImportDashboard, UpdateDashboard } from '@graflare/shared/schemas/dashboard';
import type { CreateDatasource, TestConnectionInline, UpdateDatasource } from '@graflare/shared/schemas/datasource';
import type { CreateFolder, UpdateFolder } from '@graflare/shared/schemas/folder';
import type { CreateMuteTiming, UpdateMuteTiming } from '@graflare/shared/schemas/mute-timing';
import type { CreateNotificationPolicy, UpdateNotificationPolicy } from '@graflare/shared/schemas/notification-policy';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';
import type { CreateSilence, UpdateSilence } from '@graflare/shared/schemas/silence';
import type { DescribeDatabaseResponse, DescribeTableResponse, ListLabelValuesResponse, ListLabelsResponse, ListMetricsResponse, ListTablesResponse } from '@graflare/shared/schemas/introspection';
import type { SqlFormat, SqlResponse } from '@graflare/shared/schemas/sql';
import type { DurableObjectNamespace } from 'cloudflare:workers';

import { detectFormat, importDashboard as importDashboardFn } from '@graflare/shared/import';
import { alertInstanceListQuerySchema, upsertAlertInstanceSchema } from '@graflare/shared/schemas/alert-instance';
import { createAlertRuleSchema, updateAlertRuleSchema } from '@graflare/shared/schemas/alert-rule';
import { createAlertRuleGroupSchema, updateAlertRuleGroupSchema } from '@graflare/shared/schemas/alert-rule-group';
import { annotationListQuerySchema, createAnnotationSchema } from '@graflare/shared/schemas/annotation';
import { createContactPointSchema, updateContactPointSchema } from '@graflare/shared/schemas/contact-point';
import { createDashboardSchema, importDashboardSchema, updateDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { createDatasourceSchema, datasourceCredentialsSchema, testConnectionInlineSchema, updateDatasourceSchema } from '@graflare/shared/schemas/datasource';
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
import { createMuteTimingSchema, updateMuteTimingSchema } from '@graflare/shared/schemas/mute-timing';
import { createNotificationPolicySchema, updateNotificationPolicySchema } from '@graflare/shared/schemas/notification-policy';
import { prometheusResponseSchema } from '@graflare/shared/schemas/prometheus';
import { createSilenceSchema, updateSilenceSchema } from '@graflare/shared/schemas/silence';
import { expandSqlMacros } from '@graflare/shared/sql/macros';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte, like, lte } from 'drizzle-orm';
import { Hono } from 'hono';

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
  organizations,
  silences,
} from './db/schema';
import { accessMiddleware, verifyJwt } from './middleware/access';
import { emailToOrgId, orgMiddleware } from './middleware/org';
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
import { proxyRoutes } from './routes/datasources/proxy';
import { folderRoutes } from './routes/folders/folders';
import { createPrometheusClient } from './prometheus/factory';
import { SqlClient } from './sql/client';
import { createSqlClient } from './sql/factory';
import { describeTableQuery, listTablesQuery } from './sql/introspection';

interface Bindings {
  DB: D1Database;
  ENCRYPTION_KEY: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_AUTH_EMAIL?: string;
  ALERT_RULE: DurableObjectNamespace<AlertRuleDO>;
  NOTIFICATION_WORKFLOW: Workflow;
  EMAIL: SendEmail;
  BRIDGE?: Fetcher;
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

  private get bridgeFetch(): typeof fetch {
    if (this.env.BRIDGE) {
      return this.env.BRIDGE.fetch.bind(this.env.BRIDGE);
    }
    return fetch;
  }

  private async resolveAuth(jwt: string): Promise<{ orgId: string; email: string }> {
    let email: string;
    if (this.env.DEV_AUTH_EMAIL) {
      email = this.env.DEV_AUTH_EMAIL;
    } else {
      ({ email } = await verifyJwt(jwt, this.env.ACCESS_TEAM_DOMAIN, this.env.ACCESS_AUD));
    }
    const orgId = await emailToOrgId(email);
    await this.db.insert(organizations).values({ id: orgId, name: email, createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing();
    return { orgId, email };
  }

  health(): Promise<{ status: string }> {
    return Promise.resolve({ status: 'ok' });
  }

  // --- Datasource RPC ---

  async listDatasources(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
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

  private async getDatasourceCore(orgId: string, id: string) {
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

  async getDatasource(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.getDatasourceCore(orgId, id);
  }

  async createDatasource(jwt: string, input: CreateDatasource) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createDatasourceSchema.parse(input);
    const { credentials, ...rest } = parsed;
    const id = crypto.randomUUID();
    const now = new Date();

    try {
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
    } catch (error) {
      console.error('createDatasource failed:', error);
      throw new Error('Failed to create datasource', { cause: error });
    }

    return { id, orgId, ...rest, createdAt: now, updatedAt: now };
  }

  async updateDatasource(jwt: string, id: string, input: UpdateDatasource) {
    const { orgId } = await this.resolveAuth(jwt);
    datasourceIdSchema.parse(id);
    const parsed = updateDatasourceSchema.parse(input);
    const { credentials, ...rest } = parsed;
    const now = new Date();

    try {
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
    } catch (error) {
      console.error('updateDatasource failed:', error);
      throw new Error('Failed to update datasource', { cause: error });
    }

    return this.getDatasourceCore(orgId, id);
  }

  async deleteDatasource(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    datasourceIdSchema.parse(id);
    try {
      await this.db.delete(datasources).where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)));
    } catch (error) {
      console.error('deleteDatasource failed:', error);
      throw new Error('Failed to delete datasource', { cause: error });
    }
  }

  async testConnection(jwt: string, id: string): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const { orgId } = await this.resolveAuth(jwt);
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
      const client = await createSqlClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, id, this.bridgeFetch);
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

  async testConnectionInline(jwt: string, input: TestConnectionInline): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    if (!this.env.DEV_AUTH_EMAIL) {
      await verifyJwt(jwt, this.env.ACCESS_TEAM_DOMAIN, this.env.ACCESS_AUD);
    }

    const parsed = testConnectionInlineSchema.parse(input);

    if (parsed.type === 'sql') {
      const auth =
        parsed.authType !== 'none' && parsed.credentials !== undefined ? { type: parsed.authType, credentials: parsed.credentials } : { type: 'none' as const };
      const client = new SqlClient(parsed.url, auth, parsed.queryTimeoutMs, this.bridgeFetch);
      return client.testConnection();
    }

    const start = Date.now();

    try {
      const headers: Record<string, string> = {};
      if (parsed.credentials !== undefined) {
        if (parsed.authType === 'basic' && parsed.credentials.username !== undefined && parsed.credentials.password !== undefined) {
          headers['Authorization'] = `Basic ${btoa(`${parsed.credentials.username}:${parsed.credentials.password}`)}`;
        } else if (parsed.authType === 'bearer' && parsed.credentials.token !== undefined) {
          headers['Authorization'] = `Bearer ${parsed.credentials.token}`;
        }
      }

      const res = await fetch(`${parsed.url}/api/v1/labels?limit=1`, {
        headers,
        signal: AbortSignal.timeout(parsed.queryTimeoutMs),
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

  async proxyQuery(jwt: string, datasourceId: string, endpoint: string, params: Record<string, string>): Promise<PrometheusResponse> {
    const { orgId } = await this.resolveAuth(jwt);
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

  async sqlQuery(jwt: string, datasourceId: string, rawSql: string, _format: SqlFormat, timeRange?: { from: string; to: string }): Promise<SqlResponse> {
    const { orgId } = await this.resolveAuth(jwt);
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

    const client = await createSqlClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, datasourceId, this.bridgeFetch);
    if (client === null) {
      return { columns: [], rows: [], error: 'Data source not found' };
    }

    return client.query(expandedSql, params);
  }

  // --- Introspection RPC ---

  async listTables(jwt: string, datasourceId: string): Promise<ListTablesResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const rows = await this.db
        .select()
        .from(datasources)
        .where(and(eq(datasources.id, datasourceId), eq(datasources.orgId, orgId)))
        .limit(1);

      const [ds] = rows;
      if (ds === undefined) return { tables: [], error: 'Data source not found' };
      if (ds.type !== 'sql') return { tables: [], error: 'Data source is not a SQL type' };

      const dialect = ds.dialect === 'postgres' ? 'postgres' : 'sqlite';
      const client = await createSqlClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, datasourceId, this.bridgeFetch);
      if (client === null) return { tables: [], error: 'Data source not found' };

      const q = listTablesQuery(dialect);
      const result = await client.query(q.sql, q.params);
      if (result.error !== undefined) return { tables: [], error: result.error };

      const nameIdx = result.columns.findIndex((c) => c.name === 'name');
      const schemaIdx = result.columns.findIndex((c) => c.name === 'schema');

      const tables = result.rows.map((row) => (Object.assign({ name: String(row[nameIdx] ?? '') }, schemaIdx >= 0 && row[schemaIdx] !== null && { schema: String(row[schemaIdx]) })));

      return { tables };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list tables';
      return { tables: [], error: message };
    }
  }

  async describeTable(jwt: string, datasourceId: string, tableName: string, schema?: string): Promise<DescribeTableResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const rows = await this.db
        .select()
        .from(datasources)
        .where(and(eq(datasources.id, datasourceId), eq(datasources.orgId, orgId)))
        .limit(1);

      const [ds] = rows;
      if (ds === undefined) return { columns: [], error: 'Data source not found' };
      if (ds.type !== 'sql') return { columns: [], error: 'Data source is not a SQL type' };

      const dialect = ds.dialect === 'postgres' ? 'postgres' : 'sqlite';
      const client = await createSqlClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, datasourceId, this.bridgeFetch);
      if (client === null) return { columns: [], error: 'Data source not found' };

      const q = describeTableQuery(dialect, tableName, schema);
      const result = await client.query(q.sql, q.params);
      if (result.error !== undefined) return { columns: [], error: result.error };

      const nameIdx = result.columns.findIndex((c) => c.name === 'name');
      const typeIdx = result.columns.findIndex((c) => c.name === 'type');
      const nullableIdx = result.columns.findIndex((c) => c.name === 'nullable');

      const columns = result.rows.map((row) => ({
        name: String(row[nameIdx] ?? ''),
        type: String(row[typeIdx] ?? ''),
        nullable: Number(row[nullableIdx]) === 1,
      }));

      return { columns };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to describe table';
      return { columns: [], error: message };
    }
  }

  async describeDatabase(jwt: string, datasourceId: string): Promise<DescribeDatabaseResponse> {
    try {
      const tablesResult = await this.listTables(jwt, datasourceId);
      if (tablesResult.error !== undefined) return { tables: {}, error: tablesResult.error };

      const tables: Record<string, { name: string; type: string; nullable: boolean }[]> = {};
      for (const table of tablesResult.tables) {
        const columnsResult = await this.describeTable(jwt, datasourceId, table.name, table.schema);
        if (columnsResult.error !== undefined) continue;
        tables[table.name] = columnsResult.columns;
      }

      return { tables };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to describe database';
      return { tables: {}, error: message };
    }
  }

  async listMetrics(jwt: string, datasourceId: string): Promise<ListMetricsResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const client = await createPrometheusClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, datasourceId);
      if (client === null) return { metrics: [], error: 'Data source not found' };

      const res = await client.labelValues('__name__');
      if (res.status === 'error') return { metrics: [], error: res.error ?? 'Failed to fetch metrics' };

      const d = res.data;
      if (Array.isArray(d) && d.every((x): x is string => typeof x === 'string')) {
        return { metrics: d };
      }
      return { metrics: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list metrics';
      return { metrics: [], error: message };
    }
  }

  async listLabels(jwt: string, datasourceId: string, metric?: string): Promise<ListLabelsResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const client = await createPrometheusClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, datasourceId);
      if (client === null) return { labels: [], error: 'Data source not found' };

      const match = metric !== undefined && metric !== '' ? [metric] : undefined;
      const res = await client.labels(match);
      if (res.status === 'error') return { labels: [], error: res.error ?? 'Failed to fetch labels' };

      const d = res.data;
      if (Array.isArray(d) && d.every((x): x is string => typeof x === 'string')) {
        return { labels: d };
      }
      return { labels: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list labels';
      return { labels: [], error: message };
    }
  }

  async listLabelValues(jwt: string, datasourceId: string, label: string, metric?: string): Promise<ListLabelValuesResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const client = await createPrometheusClient(this.env.DB, this.env.ENCRYPTION_KEY, orgId, datasourceId);
      if (client === null) return { values: [], error: 'Data source not found' };

      const match = metric !== undefined && metric !== '' ? [metric] : undefined;
      const res = await client.labelValues(label, match);
      if (res.status === 'error') return { values: [], error: res.error ?? 'Failed to fetch label values' };

      const d = res.data;
      if (Array.isArray(d) && d.every((x): x is string => typeof x === 'string')) {
        return { values: d };
      }
      return { values: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list label values';
      return { values: [], error: message };
    }
  }

  // --- Folder RPC ---

  async listFolders(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(folders).where(eq(folders.orgId, orgId));
  }

  async createFolder(jwt: string, input: CreateFolder) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createFolderSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();
    const slug = parsed.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

    try {
      await this.db.insert(folders).values({
        id,
        orgId,
        parentId: parsed.parentId ?? null,
        title: parsed.title,
        slug,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      console.error('createFolder failed:', error);
      throw new Error('Failed to create folder', { cause: error });
    }

    return { id, orgId, parentId: parsed.parentId ?? null, title: parsed.title, slug, createdAt: now, updatedAt: now };
  }

  async updateFolder(jwt: string, id: string, input: UpdateFolder) {
    const { orgId } = await this.resolveAuth(jwt);
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

    try {
      await this.db
        .update(folders)
        .set(setData)
        .where(and(eq(folders.id, id), eq(folders.orgId, orgId)));
    } catch (error) {
      console.error('updateFolder failed:', error);
      throw new Error('Failed to update folder', { cause: error });
    }

    const rows = await this.db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async deleteFolder(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    folderIdSchema.parse(id);
    const existing = await this.db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
      .limit(1);

    const [found] = existing;
    if (found !== undefined) {
      try {
        const { parentId: parentFolderId } = found;
        await this.db
          .update(folders)
          .set({ parentId: parentFolderId })
          .where(and(eq(folders.parentId, id), eq(folders.orgId, orgId)));
        await this.db.update(dashboards).set({ folderId: parentFolderId }).where(eq(dashboards.folderId, id));
        await this.db.update(alertRuleGroups).set({ folderId: parentFolderId }).where(eq(alertRuleGroups.folderId, id));
        await this.db.delete(folders).where(eq(folders.id, id));
      } catch (error) {
        console.error('deleteFolder failed:', error);
        throw new Error('Failed to delete folder', { cause: error });
      }
    }
  }

  // --- Dashboard RPC ---

  async listDashboards(jwt: string, opts?: DashboardListQuery) {
    const { orgId } = await this.resolveAuth(jwt);
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
      const { tag } = opts;
      rows = rows.filter(r => r.tags.includes(tag));
    }

    return rows;
  }

  private async getDashboardCore(orgId: string, id: string) {
    dashboardIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getDashboard(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.getDashboardCore(orgId, id);
  }

  private async createDashboardCore(orgId: string, input: CreateDashboard, email: string) {
    const parsed = createDashboardSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();
    const slug = parsed.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

    try {
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
        createdBy: email,
        createdAt: now,
      });
    } catch (error) {
      console.error('createDashboard failed:', error);
      throw new Error('Failed to create dashboard', { cause: error });
    }

    return this.getDashboardCore(orgId, id);
  }

  async createDashboard(jwt: string, input: CreateDashboard) {
    const { orgId, email } = await this.resolveAuth(jwt);
    return this.createDashboardCore(orgId, input, email);
  }

  async updateDashboard(jwt: string, id: string, input: UpdateDashboard) {
    const { orgId, email } = await this.resolveAuth(jwt);
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

    try {
      await this.db.update(dashboards).set(setData).where(eq(dashboards.id, id));

      const updated = await this.db.select().from(dashboards).where(eq(dashboards.id, id)).limit(1);

      const versionId = crypto.randomUUID();
      await this.db.insert(dashboardVersions).values({
        id: versionId,
        dashboardId: id,
        version: newVersion,
        data: JSON.stringify(updated[0]),
        message: message ?? '',
        createdBy: email,
        createdAt: now,
      });

      return updated[0] ?? null;
    } catch (error) {
      console.error('updateDashboard failed:', error);
      throw new Error('Failed to update dashboard', { cause: error });
    }
  }

  async deleteDashboard(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    dashboardIdSchema.parse(id);
    try {
      await this.db.delete(dashboards).where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)));
    } catch (error) {
      console.error('deleteDashboard failed:', error);
      throw new Error('Failed to delete dashboard', { cause: error });
    }
  }

  // --- Dashboard Version RPC ---

  async listDashboardVersions(jwt: string, dashboardId: string) {
    const { orgId } = await this.resolveAuth(jwt);
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

  async getDashboardVersion(jwt: string, dashboardId: string, version: number) {
    const { orgId } = await this.resolveAuth(jwt);
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

  async restoreDashboardVersion(jwt: string, dashboardId: string, version: number) {
    const { orgId, email } = await this.resolveAuth(jwt);
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

    try {
      await this.db.update(dashboards).set(restoreFields).where(eq(dashboards.id, dashboardId));

      const updated = await this.db.select().from(dashboards).where(eq(dashboards.id, dashboardId)).limit(1);

      const versionId = crypto.randomUUID();
      await this.db.insert(dashboardVersions).values({
        id: versionId,
        dashboardId,
        version: newVersion,
        data: JSON.stringify(updated[0]),
        message: `Restored from version ${version}`,
        createdBy: email,
        createdAt: now,
      });

      return updated[0] ?? null;
    } catch (error) {
      console.error('restoreDashboardVersion failed:', error);
      throw new Error('Failed to restore dashboard version', { cause: error });
    }
  }

  async importDashboard(jwt: string, input: ImportDashboard) {
    const { orgId, email } = await this.resolveAuth(jwt);
    const parsed = importDashboardSchema.parse(input);

    const format = parsed.format ?? detectFormat(parsed.json);
    const { dashboard: imported, warnings } = importDashboardFn(parsed.json, format);

    const dashboard = await this.createDashboardCore(
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
      email,
    );

    return { dashboard, warnings };
  }

  // --- Alert Rule Group RPC ---

  async listAlertRuleGroups(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(alertRuleGroups).where(eq(alertRuleGroups.orgId, orgId));
  }

  private async getAlertRuleGroupCore(orgId: string, id: string) {
    alertRuleGroupIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(alertRuleGroups)
      .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getAlertRuleGroup(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.getAlertRuleGroupCore(orgId, id);
  }

  async createAlertRuleGroup(jwt: string, input: CreateAlertRuleGroup) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createAlertRuleGroupSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    try {
      await this.db.insert(alertRuleGroups).values({
        id,
        orgId,
        folderId: parsed.folderId ?? null,
        name: parsed.name,
        evalIntervalS: parsed.evalIntervalS ?? 60,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      console.error('createAlertRuleGroup failed:', error);
      throw new Error('Failed to create alert rule group', { cause: error });
    }

    return { id, orgId, folderId: parsed.folderId ?? null, name: parsed.name, evalIntervalS: parsed.evalIntervalS ?? 60, createdAt: now, updatedAt: now };
  }

  async updateAlertRuleGroup(jwt: string, id: string, input: UpdateAlertRuleGroup) {
    const { orgId } = await this.resolveAuth(jwt);
    alertRuleGroupIdSchema.parse(id);
    const parsed = updateAlertRuleGroupSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.name !== undefined) setData['name'] = parsed.name;
    if (parsed.folderId !== undefined) setData['folderId'] = parsed.folderId;
    if (parsed.evalIntervalS !== undefined) setData['evalIntervalS'] = parsed.evalIntervalS;

    try {
      await this.db
        .update(alertRuleGroups)
        .set(setData)
        .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)));
    } catch (error) {
      console.error('updateAlertRuleGroup failed:', error);
      throw new Error('Failed to update alert rule group', { cause: error });
    }

    return this.getAlertRuleGroupCore(orgId, id);
  }

  async deleteAlertRuleGroup(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    alertRuleGroupIdSchema.parse(id);
    try {
      await this.db.delete(alertRuleGroups).where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)));
    } catch (error) {
      console.error('deleteAlertRuleGroup failed:', error);
      throw new Error('Failed to delete alert rule group', { cause: error });
    }
  }

  // --- Alert Rule RPC ---

  async listAlertRules(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(alertRules).where(eq(alertRules.orgId, orgId));
  }

  private async getAlertRuleCore(orgId: string, id: string) {
    alertRuleIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getAlertRule(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.getAlertRuleCore(orgId, id);
  }

  async createAlertRule(jwt: string, input: CreateAlertRule) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createAlertRuleSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    try {
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
        const group = await this.getAlertRuleGroupCore(orgId, parsed.groupId);
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
    } catch (error) {
      console.error('createAlertRule failed:', error);
      throw new Error('Failed to create alert rule', { cause: error });
    }

    return this.getAlertRuleCore(orgId, id);
  }

  async updateAlertRule(jwt: string, id: string, input: UpdateAlertRule) {
    const { orgId } = await this.resolveAuth(jwt);
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

    try {
      await this.db
        .update(alertRules)
        .set(setData)
        .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));
    } catch (error) {
      console.error('updateAlertRule failed:', error);
      throw new Error('Failed to update alert rule', { cause: error });
    }

    return this.getAlertRuleCore(orgId, id);
  }

  async deleteAlertRule(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    alertRuleIdSchema.parse(id);
    try {
      const stub = this.env.ALERT_RULE.getByName(id);
      await stub.stop();
      await this.db.delete(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));
    } catch (error) {
      console.error('deleteAlertRule failed:', error);
      throw new Error('Failed to delete alert rule', { cause: error });
    }
  }

  // --- Alert Instance RPC ---

  async listAlertInstances(jwt: string, opts?: AlertInstanceListQuery) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = opts ? alertInstanceListQuerySchema.parse(opts) : undefined;
    const conditions = [eq(alertInstances.orgId, orgId)];
    if (parsed?.ruleId !== undefined) conditions.push(eq(alertInstances.ruleId, parsed.ruleId));
    if (parsed?.state !== undefined) conditions.push(eq(alertInstances.state, parsed.state));

    return this.db
      .select()
      .from(alertInstances)
      .where(and(...conditions));
  }

  async upsertAlertInstances(jwt: string, instances: UpsertAlertInstance[]) {
    const { orgId } = await this.resolveAuth(jwt);
    for (const inst of instances) {
      const parsed = upsertAlertInstanceSchema.parse(inst);
      try {
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
      } catch (error) {
        console.error('upsertAlertInstances failed:', error);
        throw new Error('Failed to upsert alert instance', { cause: error });
      }
    }
  }

  // --- Contact Point RPC ---

  async listContactPoints(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    const rows = await this.db.select().from(contactPoints).where(eq(contactPoints.orgId, orgId));
    return rows.map(r => {
      const { settings } = r;
      if (typeof settings === 'object' && settings?.['type'] === 'webhook' && typeof settings['password'] === 'string' && settings['password'].length > 0) {
        return Object.assign(r, {
          settings: {
            ...settings,
            password: '******',
          },
        });
      }
      return r;
    });
  }

  private async getContactPointCore(orgId: string, id: string) {
    contactPointIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(contactPoints)
      .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
      .limit(1);
    const row = rows[0] ?? null;
    if (row === null) return null;
    const { settings } = row;
    if (typeof settings === 'object' && settings?.['type'] === 'webhook' && typeof settings['password'] === 'string' && settings['password'].length > 0) {
      return { ...row, settings: { ...settings, password: '******' } };
    }
    return row;
  }

  async getContactPoint(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.getContactPointCore(orgId, id);
  }

  async createContactPoint(jwt: string, input: CreateContactPoint) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createContactPointSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    try {
      let { settings } = parsed;
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
    } catch (error) {
      console.error('createContactPoint failed:', error);
      throw new Error('Failed to create contact point', { cause: error });
    }

    return this.getContactPointCore(orgId, id);
  }

  async updateContactPoint(jwt: string, id: string, input: UpdateContactPoint) {
    const { orgId } = await this.resolveAuth(jwt);
    contactPointIdSchema.parse(id);
    const parsed = updateContactPointSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.name !== undefined) setData['name'] = parsed.name;
    if (parsed.type !== undefined) setData['type'] = parsed.type;

    try {
      if (parsed.settings !== undefined) {
        let { settings } = parsed;
        if (parsed.settings.type === 'webhook' && parsed.settings.password.length > 0) {
          settings = { ...parsed.settings, password: await encryptCredentials(parsed.settings.password, this.env.ENCRYPTION_KEY) };
        }
        setData['settings'] = settings;
      }

      await this.db
        .update(contactPoints)
        .set(setData)
        .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));
    } catch (error) {
      console.error('updateContactPoint failed:', error);
      throw new Error('Failed to update contact point', { cause: error });
    }

    return this.getContactPointCore(orgId, id);
  }

  async deleteContactPoint(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    contactPointIdSchema.parse(id);
    try {
      await this.db.delete(contactPoints).where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));
    } catch (error) {
      console.error('deleteContactPoint failed:', error);
      throw new Error('Failed to delete contact point', { cause: error });
    }
  }

  // --- Notification Policy RPC ---

  async listNotificationPolicies(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(notificationPolicies).where(eq(notificationPolicies.orgId, orgId));
  }

  async createNotificationPolicy(jwt: string, input: CreateNotificationPolicy) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createNotificationPolicySchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    try {
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
    } catch (error) {
      console.error('createNotificationPolicy failed:', error);
      throw new Error('Failed to create notification policy', { cause: error });
    }

    const rows = await this.db.select().from(notificationPolicies).where(eq(notificationPolicies.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async updateNotificationPolicy(jwt: string, id: string, input: UpdateNotificationPolicy) {
    const { orgId } = await this.resolveAuth(jwt);
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

    try {
      await this.db
        .update(notificationPolicies)
        .set(setData)
        .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));
    } catch (error) {
      console.error('updateNotificationPolicy failed:', error);
      throw new Error('Failed to update notification policy', { cause: error });
    }

    const rows = await this.db.select().from(notificationPolicies).where(eq(notificationPolicies.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async deleteNotificationPolicy(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    notificationPolicyIdSchema.parse(id);
    try {
      await this.db.delete(notificationPolicies).where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));
    } catch (error) {
      console.error('deleteNotificationPolicy failed:', error);
      throw new Error('Failed to delete notification policy', { cause: error });
    }
  }

  // --- Silence RPC ---

  async listSilences(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(silences).where(eq(silences.orgId, orgId));
  }

  private async getSilenceCore(orgId: string, id: string) {
    silenceIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(silences)
      .where(and(eq(silences.id, id), eq(silences.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getSilence(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.getSilenceCore(orgId, id);
  }

  async createSilence(jwt: string, input: CreateSilence) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createSilenceSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    try {
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
    } catch (error) {
      console.error('createSilence failed:', error);
      throw new Error('Failed to create silence', { cause: error });
    }

    return this.getSilenceCore(orgId, id);
  }

  async updateSilence(jwt: string, id: string, input: UpdateSilence) {
    const { orgId } = await this.resolveAuth(jwt);
    silenceIdSchema.parse(id);
    const parsed = updateSilenceSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.matchers !== undefined) setData['matchers'] = parsed.matchers;
    if (parsed.startsAt !== undefined) setData['startsAt'] = new Date(parsed.startsAt);
    if (parsed.endsAt !== undefined) setData['endsAt'] = new Date(parsed.endsAt);
    if (parsed.comment !== undefined) setData['comment'] = parsed.comment;
    if (parsed.createdBy !== undefined) setData['createdBy'] = parsed.createdBy;

    try {
      await this.db
        .update(silences)
        .set(setData)
        .where(and(eq(silences.id, id), eq(silences.orgId, orgId)));
    } catch (error) {
      console.error('updateSilence failed:', error);
      throw new Error('Failed to update silence', { cause: error });
    }

    return this.getSilenceCore(orgId, id);
  }

  async deleteSilence(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    silenceIdSchema.parse(id);
    try {
      await this.db.delete(silences).where(and(eq(silences.id, id), eq(silences.orgId, orgId)));
    } catch (error) {
      console.error('deleteSilence failed:', error);
      throw new Error('Failed to delete silence', { cause: error });
    }
  }

  // --- Mute Timing RPC ---

  async listMuteTimings(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(muteTimings).where(eq(muteTimings.orgId, orgId));
  }

  private async getMuteTimingCore(orgId: string, id: string) {
    muteTimingIdSchema.parse(id);
    const rows = await this.db
      .select()
      .from(muteTimings)
      .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getMuteTiming(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.getMuteTimingCore(orgId, id);
  }

  async createMuteTiming(jwt: string, input: CreateMuteTiming) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createMuteTimingSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    try {
      await this.db.insert(muteTimings).values({
        id,
        orgId,
        name: parsed.name,
        intervals: parsed.intervals ?? [],
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      console.error('createMuteTiming failed:', error);
      throw new Error('Failed to create mute timing', { cause: error });
    }

    return this.getMuteTimingCore(orgId, id);
  }

  async updateMuteTiming(jwt: string, id: string, input: UpdateMuteTiming) {
    const { orgId } = await this.resolveAuth(jwt);
    muteTimingIdSchema.parse(id);
    const parsed = updateMuteTimingSchema.parse(input);
    const now = new Date();

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.name !== undefined) setData['name'] = parsed.name;
    if (parsed.intervals !== undefined) setData['intervals'] = parsed.intervals;

    try {
      await this.db
        .update(muteTimings)
        .set(setData)
        .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));
    } catch (error) {
      console.error('updateMuteTiming failed:', error);
      throw new Error('Failed to update mute timing', { cause: error });
    }

    return this.getMuteTimingCore(orgId, id);
  }

  async deleteMuteTiming(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    muteTimingIdSchema.parse(id);
    try {
      await this.db.delete(muteTimings).where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));
    } catch (error) {
      console.error('deleteMuteTiming failed:', error);
      throw new Error('Failed to delete mute timing', { cause: error });
    }
  }

  // --- Annotation RPC ---

  async listAnnotations(jwt: string, opts?: AnnotationListQuery) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = opts ? annotationListQuerySchema.parse(opts) : undefined;
    const conditions = [eq(annotations.orgId, orgId)];

    if (parsed?.dashboardId !== undefined) conditions.push(eq(annotations.dashboardId, parsed.dashboardId));
    if (parsed?.alertRuleId !== undefined) conditions.push(eq(annotations.alertRuleId, parsed.alertRuleId));
    if (parsed?.from !== undefined) conditions.push(gte(annotations.time, new Date(parsed.from)));
    if (parsed?.to !== undefined) conditions.push(lte(annotations.time, new Date(parsed.to)));

    let rows = await this.db
      .select()
      .from(annotations)
      .where(and(...conditions));

    if (parsed?.tag !== undefined) {
      const { tag } = parsed;
      rows = rows.filter(r => r.tags.includes(tag));
    }

    return rows;
  }

  async createAnnotation(jwt: string, input: CreateAnnotation) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createAnnotationSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    try {
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
    } catch (error) {
      console.error('createAnnotation failed:', error);
      throw new Error('Failed to create annotation', { cause: error });
    }

    const rows = await this.db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async deleteAnnotation(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    annotationIdSchema.parse(id);
    try {
      await this.db.delete(annotations).where(and(eq(annotations.id, id), eq(annotations.orgId, orgId)));
    } catch (error) {
      console.error('deleteAnnotation failed:', error);
      throw new Error('Failed to delete annotation', { cause: error });
    }
  }
}

export { AlertRuleDO } from './alerting/alert-rule-do';
export { NotificationWorkflow } from './alerting/notification-workflow';
