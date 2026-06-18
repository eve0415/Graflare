import type { AlertRuleDO } from './alerting/alert-rule-do';
import type { RuleLifecycleDeps } from './alerting/rule-lifecycle';
import type { ServiceTokenClient } from './cloudflare/access-service-tokens';
import type { Database } from './db';
import type { AuthSubject } from './middleware/access';
import type { PrometheusAuth } from './prometheus/client';
import type { AlertInstanceListQuery, UpsertAlertInstance } from '@graflare/shared/schemas/alert-instance';
import type { CreateAlertRule, UpdateAlertRule } from '@graflare/shared/schemas/alert-rule';
import type { CreateAlertRuleGroup, UpdateAlertRuleGroup } from '@graflare/shared/schemas/alert-rule-group';
import type { AnnotationListQuery, CreateAnnotation } from '@graflare/shared/schemas/annotation';
import type { CreateContactPoint, UpdateContactPoint } from '@graflare/shared/schemas/contact-point';
import type { CreateDashboard, DashboardListQuery, ImportDashboard, UpdateDashboard } from '@graflare/shared/schemas/dashboard';
import type { CreateDatasource, TestConnectionInline, UpdateDatasource } from '@graflare/shared/schemas/datasource';
import type { CreateFolder, UpdateFolder } from '@graflare/shared/schemas/folder';
import type {
  DescribeDatabaseResponse,
  DescribeTableResponse,
  ListLabelValuesResponse,
  ListLabelsResponse,
  ListMetricsResponse,
  ListTablesResponse,
} from '@graflare/shared/schemas/introspection';
import type { CreateMuteTiming, UpdateMuteTiming } from '@graflare/shared/schemas/mute-timing';
import type { CreateNotificationPolicy, UpdateNotificationPolicy } from '@graflare/shared/schemas/notification-policy';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';
import type { CreateServiceToken, ServiceTokenCreateResult, ServiceTokenMetadata } from '@graflare/shared/schemas/service-token';
import type { CreateSilence, UpdateSilence } from '@graflare/shared/schemas/silence';
import type { SqlFormat, SqlResponse } from '@graflare/shared/schemas/sql';
import type { ErrorHandler } from 'hono';

import { detectFormat, importDashboard as importDashboardFn } from '@graflare/shared/import';
import { alertInstanceListQuerySchema, upsertAlertInstanceSchema } from '@graflare/shared/schemas/alert-instance';
import { createAlertRuleGroupSchema } from '@graflare/shared/schemas/alert-rule-group';
import { annotationListQuerySchema, createAnnotationSchema } from '@graflare/shared/schemas/annotation';
import { createContactPointSchema, updateContactPointSchema } from '@graflare/shared/schemas/contact-point';
import { createDashboardSchema, importDashboardSchema, updateDashboardSchema } from '@graflare/shared/schemas/dashboard';
import { createDatasourceSchema, testConnectionInlineSchema, updateDatasourceSchema } from '@graflare/shared/schemas/datasource';
import { createFolderSchema, updateFolderSchema } from '@graflare/shared/schemas/folder';
import {
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
import { createServiceTokenSchema, serviceTokenIdParamSchema } from '@graflare/shared/schemas/service-token';
import { createSilenceSchema, updateSilenceSchema } from '@graflare/shared/schemas/silence';
import { expandSqlMacros } from '@graflare/shared/sql/macros';
import { resolveRange } from '@graflare/shared/time/resolve';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, gte, like, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { encryptSecret, redactSecret, resolveSecretOnUpdate } from './alerting/contact-point-secrets';
import { createRule, deleteRule, deleteRuleGroup, getRule, getRuleGroup, updateRule, updateRuleGroup } from './alerting/rule-lifecycle';
import { CacheApiStore, cachedProxyQuery } from './cache/query-cache';
import { createServiceTokenClient } from './cloudflare/access-service-tokens';
import { encryptCredentials } from './crypto/credentials';
import { createDb } from './db';
import {
  accessServiceTokens,
  alertInstances,
  alertRuleGroups,
  alertRules,
  annotations,
  contactPoints,
  dashboardVersions,
  dashboards,
  datasourcePublicColumns,
  datasources,
  folders,
  muteTimings,
  notificationPolicies,
  silences,
} from './db/schema';
import { accessMiddleware, subjectFromPayload, subjectLabel, verifyJwt } from './middleware/access';
import { orgMiddleware, resolveOrgId } from './middleware/org';
import { authHeaders, decryptedAuth } from './prometheus/auth';
import { createPrometheusClient } from './prometheus/factory';
import { testPrometheusEndpoint } from './prometheus/test-connection';
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
import { serviceTokenRoutes } from './routes/service-tokens/service-tokens';
import { slugify } from './slugify';
import { SqlClient } from './sql/client';
import { createSqlClient } from './sql/factory';
import { describeAllColumnsQuery, describeTableQuery, listTablesQuery } from './sql/introspection';

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
  // Maintainer-provisioned secrets (set via `wrangler secret put`). Used to drive
  // the Cloudflare API for Access service tokens. Never log CF_API_TOKEN.
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    user: AuthSubject;
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
app.route('/api/v1/alert-rule-groups', alertRuleGroupRoutes);
app.route('/api/v1/alert-rules', alertRuleRoutes);
app.route('/api/v1/alert-instances', alertInstanceRoutes);
app.route('/api/v1/contact-points', contactPointRoutes);
app.route('/api/v1/notification-policies', notificationPolicyRoutes);
app.route('/api/v1/silences', silenceRoutes);
app.route('/api/v1/mute-timings', muteTimingRoutes);
app.route('/api/v1/annotations', annotationRoutes);
app.route('/api/v1/service-tokens', serviceTokenRoutes);

// Mirrors the RPC methods' log-and-wrap so the two surfaces fail alike.
const onHttpError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(`${c.req.method} ${c.req.path} failed:`, err);
  return c.json({ error: 'Internal server error' }, 500);
};

app.notFound(c => c.json({ error: 'Not found' }, 404));
app.onError(onHttpError);

export default app;

/** A SQL introspection result's rows mapped to {name, schema?} table descriptors. */
const parseTableRows = (result: SqlResponse): { name: string; schema?: string }[] => {
  const nameIdx = result.columns.findIndex(c => c.name === 'name');
  const schemaIdx = result.columns.findIndex(c => c.name === 'schema');
  return result.rows.map(row => ({
    name: String(row[nameIdx] ?? ''),
    ...(schemaIdx !== -1 && row[schemaIdx] !== null ? { schema: String(row[schemaIdx]) } : {}),
  }));
};

/** A SQL introspection result's rows mapped to {name, type, nullable} column descriptors. */
const parseColumnRows = (result: SqlResponse): { name: string; type: string; nullable: boolean }[] => {
  const nameIdx = result.columns.findIndex(c => c.name === 'name');
  const typeIdx = result.columns.findIndex(c => c.name === 'type');
  const nullableIdx = result.columns.findIndex(c => c.name === 'nullable');
  return result.rows.map(row => ({
    name: String(row[nameIdx] ?? ''),
    type: String(row[typeIdx] ?? ''),
    nullable: Number(row[nullableIdx]) === 1,
  }));
};

/** Group a flat {table, name, type, nullable} introspection result into columns keyed by table. */
const groupColumnsByTable = (result: SqlResponse): Record<string, { name: string; type: string; nullable: boolean }[]> => {
  const tableIdx = result.columns.findIndex(c => c.name === 'table');
  const nameIdx = result.columns.findIndex(c => c.name === 'name');
  const typeIdx = result.columns.findIndex(c => c.name === 'type');
  const nullableIdx = result.columns.findIndex(c => c.name === 'nullable');
  const tables: Record<string, { name: string; type: string; nullable: boolean }[]> = {};
  for (const row of result.rows) {
    const table = String(row[tableIdx] ?? '');
    if (table === '') continue;
    (tables[table] ??= []).push({ name: String(row[nameIdx] ?? ''), type: String(row[typeIdx] ?? ''), nullable: Number(row[nullableIdx]) === 1 });
  }
  return tables;
};

/** Narrow a Prometheus label/metric response payload to a string[]. */
const isStringArray = (d: unknown): d is string[] => Array.isArray(d) && d.every((x): x is string => typeof x === 'string');

export class GraflareAPI extends WorkerEntrypoint<Bindings> {
  // Memoized: `drizzle()` walks the whole relational schema config on every
  // call, and a single RPC method can touch `this.db` five times.
  #db: Database | undefined;

  private get db(): Database {
    return (this.#db ??= createDb(this.env.DB));
  }

  // `caches.default` is the same global Cache object every call; memoize the wrapper so each
  // proxyQuery doesn't reallocate it.
  #cacheStore: CacheApiStore | undefined;

  private get cacheStore(): CacheApiStore {
    return (this.#cacheStore ??= new CacheApiStore(caches.default));
  }

  private get bridgeFetch(): typeof fetch {
    if (this.env.BRIDGE) {
      return this.env.BRIDGE.fetch.bind(this.env.BRIDGE);
    }
    return fetch;
  }

  private get ruleDeps(): RuleLifecycleDeps {
    return { db: this.db, alertRule: this.env.ALERT_RULE };
  }

  /**
   * The Cloudflare Access service-token client, bound to this worker's
   * maintainer-provisioned credentials. JS-private (`#`) so it is NOT exposed
   * over the RPC service binding — a public method here would hand any binding
   * caller an account-wide, un-org-scoped CF client (list/create/delete every
   * token on the account). Tests mock the `createServiceTokenClient` module
   * export instead of this method.
   */
  #serviceTokens(): ServiceTokenClient {
    return createServiceTokenClient({ apiToken: this.env.CF_API_TOKEN, accountId: this.env.CF_ACCOUNT_ID });
  }

  private async resolveAuth(jwt: string): Promise<{ orgId: string; subject: AuthSubject }> {
    let subject: AuthSubject;
    if (this.env.DEV_AUTH_EMAIL) {
      subject = { kind: 'user', email: this.env.DEV_AUTH_EMAIL, name: this.env.DEV_AUTH_EMAIL };
    } else {
      const payload = await verifyJwt(jwt, this.env.ACCESS_TEAM_DOMAIN, this.env.ACCESS_AUD);
      // Defense-in-depth: the web worker only ever forwards a browser USER's
      // identity JWT over this binding, so this service-token branch is not the
      // load-bearing enforcement point (that is accessMiddleware on the
      // Access-guarded HTTP path) — we mirror it so the two cannot drift.
      const resolved = subjectFromPayload(payload);
      if (resolved === null) {
        throw new Error('Access JWT has no usable subject');
      }
      subject = resolved;
    }
    const orgId = await resolveOrgId(this.db, subject);
    if (orgId === null) {
      throw new Error('Unknown service token');
    }
    return { orgId, subject };
  }

  health(): Promise<{ status: string }> {
    return Promise.resolve({ status: 'ok' });
  }

  // --- Datasource RPC ---

  async listDatasources(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select(datasourcePublicColumns).from(datasources).where(eq(datasources.orgId, orgId));
  }

  private async getDatasourceCore(orgId: string, id: string) {
    datasourceIdSchema.parse(id);
    const rows = await this.db
      .select(datasourcePublicColumns)
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
      const client = await createSqlClient(ds, this.env.ENCRYPTION_KEY, this.bridgeFetch);
      return client.testConnection();
    }

    const auth = await decryptedAuth(ds.credentials, ds.authType, this.env.ENCRYPTION_KEY);
    return testPrometheusEndpoint(ds.url, auth, ds.queryTimeoutMs);
  }

  async testConnectionInline(jwt: string, input: TestConnectionInline): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    if (!this.env.DEV_AUTH_EMAIL) {
      await verifyJwt(jwt, this.env.ACCESS_TEAM_DOMAIN, this.env.ACCESS_AUD);
    }

    const parsed = testConnectionInlineSchema.parse(input);

    const auth: PrometheusAuth =
      parsed.authType !== 'none' && parsed.credentials !== undefined ? { type: parsed.authType, credentials: parsed.credentials } : { type: 'none' };

    if (parsed.type === 'sql') {
      const client = new SqlClient(parsed.url, auth, parsed.queryTimeoutMs, this.bridgeFetch);
      return client.testConnection();
    }

    return testPrometheusEndpoint(parsed.url, auth, parsed.queryTimeoutMs);
  }

  private static ALLOWED_ENDPOINTS = new Set(['/api/v1/query', '/api/v1/query_range', '/api/v1/labels', '/api/v1/series']);
  private static LABEL_VALUES_RE = /^\/api\/v1\/label\/[^/]+\/values$/;

  async proxyQuery(jwt: string, datasourceId: string, endpoint: string, params: Record<string, string>): Promise<PrometheusResponse> {
    const { orgId } = await this.resolveAuth(jwt);
    datasourceIdSchema.parse(datasourceId);
    if (!GraflareAPI.ALLOWED_ENDPOINTS.has(endpoint) && !GraflareAPI.LABEL_VALUES_RE.test(endpoint)) {
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

    // The live upstream call. `cachedProxyQuery` may step-align `params` (snapping
    // start/end) before invoking this, so the URL/body built here is bucketed too.
    // The allowlist + origin assertion + credential attachment stay entirely
    // inside this run — caching is purely additive AFTER auth/ownership.
    const runLive = async (queryParams: Record<string, string>): Promise<PrometheusResponse> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };

      try {
        const base = new URL(ds.url);
        base.pathname = base.pathname.replace(/\/$/, '') + endpoint;
        const isPost = endpoint.includes('/query');

        const targetUrl = isPost ? base.toString() : `${base.toString()}?${new URLSearchParams(queryParams).toString()}`;

        if (new URL(targetUrl).origin !== base.origin) {
          return { status: 'error', errorType: 'bad_request', error: 'URL origin mismatch' };
        }

        // Attach credentials only after confirming the target origin matches the datasource.
        Object.assign(headers, authHeaders(await decryptedAuth(ds.credentials, ds.authType, this.env.ENCRYPTION_KEY)));

        const res = await fetch(targetUrl, {
          method: isPost ? 'POST' : 'GET',
          headers,
          ...(isPost && { body: new URLSearchParams(queryParams).toString() }),
          signal: AbortSignal.timeout(ds.queryTimeoutMs),
        });

        return prometheusResponseSchema.parse(await res.json());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Query failed';
        return { status: 'error', errorType: 'timeout', error: message };
      }
    };

    return cachedProxyQuery(this.cacheStore, { orgId, datasourceId, endpoint, params, cacheTtl: ds.cacheTtl }, runLive, work => {
      this.ctx.waitUntil(work);
    });
  }

  // Single place the SQL/introspection methods load a datasource: fetch (org-scoped), require a
  // SQL type, resolve the dialect, and build the client. Returns an error string otherwise.
  private async loadSqlClient(orgId: string, datasourceId: string): Promise<{ client: SqlClient; dialect: 'postgres' | 'sqlite' } | { error: string }> {
    const rows = await this.db
      .select()
      .from(datasources)
      .where(and(eq(datasources.id, datasourceId), eq(datasources.orgId, orgId)))
      .limit(1);
    const [ds] = rows;
    if (ds === undefined) return { error: 'Data source not found' };
    if (ds.type !== 'sql') return { error: 'Data source is not a SQL type' };
    const dialect = ds.dialect === 'postgres' ? 'postgres' : 'sqlite';
    const client = await createSqlClient(ds, this.env.ENCRYPTION_KEY, this.bridgeFetch);
    return { client, dialect };
  }

  // --- SQL RPC ---

  async sqlQuery(jwt: string, datasourceId: string, rawSql: string, _format: SqlFormat, timeRange?: { from: string; to: string }): Promise<SqlResponse> {
    const { orgId } = await this.resolveAuth(jwt);
    datasourceIdSchema.parse(datasourceId);

    const sqlClient = await this.loadSqlClient(orgId, datasourceId);
    if ('error' in sqlClient) return { columns: [], rows: [], error: sqlClient.error };

    const resolvedTimeRange = timeRange
      ? resolveRange(timeRange.from, timeRange.to)
      : { from: Math.floor(Date.now() / 1000) - 3600, to: Math.floor(Date.now() / 1000) };

    const { sql: expandedSql, params } = expandSqlMacros(rawSql, sqlClient.dialect, resolvedTimeRange);

    return sqlClient.client.query(expandedSql, params);
  }

  // --- Introspection RPC ---

  async listTables(jwt: string, datasourceId: string): Promise<ListTablesResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const sqlClient = await this.loadSqlClient(orgId, datasourceId);
      if ('error' in sqlClient) return { tables: [], error: sqlClient.error };

      const q = listTablesQuery(sqlClient.dialect);
      const result = await sqlClient.client.query(q.sql, q.params);
      if (result.error !== undefined) return { tables: [], error: result.error };

      return { tables: parseTableRows(result) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list tables';
      return { tables: [], error: message };
    }
  }

  async describeTable(jwt: string, datasourceId: string, tableName: string, schema?: string): Promise<DescribeTableResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const sqlClient = await this.loadSqlClient(orgId, datasourceId);
      if ('error' in sqlClient) return { columns: [], error: sqlClient.error };

      const q = describeTableQuery(sqlClient.dialect, tableName, schema);
      const result = await sqlClient.client.query(q.sql, q.params);
      if (result.error !== undefined) return { columns: [], error: result.error };

      return { columns: parseColumnRows(result) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to describe table';
      return { columns: [], error: message };
    }
  }

  async describeDatabase(jwt: string, datasourceId: string): Promise<DescribeDatabaseResponse> {
    try {
      const { orgId } = await this.resolveAuth(jwt);
      datasourceIdSchema.parse(datasourceId);

      const sqlClient = await this.loadSqlClient(orgId, datasourceId);
      if ('error' in sqlClient) return { tables: {}, error: sqlClient.error };

      // Postgres: one information_schema query for every column, instead of a per-table fan-out.
      if (sqlClient.dialect === 'postgres') {
        const aq = describeAllColumnsQuery();
        const result = await sqlClient.client.query(aq.sql, aq.params);
        if (result.error !== undefined) return { tables: {}, error: result.error };
        return { tables: groupColumnsByTable(result) };
      }

      const tq = listTablesQuery(sqlClient.dialect);
      const tablesResult = await sqlClient.client.query(tq.sql, tq.params);
      if (tablesResult.error !== undefined) return { tables: {}, error: tablesResult.error };

      const describedTables = await Promise.all(
        parseTableRows(tablesResult).map(async table => {
          const dq = describeTableQuery(sqlClient.dialect, table.name, table.schema);
          const result = await sqlClient.client.query(dq.sql, dq.params);
          if (result.error !== undefined) return null;
          return { name: table.name, columns: parseColumnRows(result) };
        }),
      );

      const tables: Record<string, { name: string; type: string; nullable: boolean }[]> = {};
      for (const t of describedTables) {
        if (t !== null) tables[t.name] = t.columns;
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
      if (isStringArray(d)) {
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
      if (isStringArray(d)) {
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
      if (isStringArray(d)) {
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
    const slug = slugify(parsed.title);

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
      setData['slug'] = slugify(parsed.title);
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

    const rows = await this.db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.orgId, orgId)))
      .limit(1);
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
        await this.db.batch([
          this.db
            .update(folders)
            .set({ parentId: parentFolderId })
            .where(and(eq(folders.parentId, id), eq(folders.orgId, orgId))),
          this.db
            .update(dashboards)
            .set({ folderId: parentFolderId })
            .where(and(eq(dashboards.folderId, id), eq(dashboards.orgId, orgId))),
          this.db
            .update(alertRuleGroups)
            .set({ folderId: parentFolderId })
            .where(and(eq(alertRuleGroups.folderId, id), eq(alertRuleGroups.orgId, orgId))),
          this.db.delete(folders).where(and(eq(folders.id, id), eq(folders.orgId, orgId))),
        ]);
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
    // Push tag filtering into SQLite (json_each over the tags JSON array) instead of fetching the
    // whole org's dashboards and filtering in JS.
    if (opts?.tag !== undefined) conditions.push(sql`exists (select 1 from json_each(${dashboards.tags}) where value = ${opts.tag})`);

    const rows = await this.db
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

  private async insertDashboardWithVersion(orgId: string, input: CreateDashboard, createdBy: string) {
    const parsed = createDashboardSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();
    const slug = slugify(parsed.title);

    try {
      await this.db.batch([
        this.db.insert(dashboards).values({
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
        this.db.insert(dashboardVersions).values({
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

    return this.getDashboardCore(orgId, id);
  }

  async createDashboard(jwt: string, input: CreateDashboard) {
    const { orgId, subject } = await this.resolveAuth(jwt);
    return this.insertDashboardWithVersion(orgId, input, subjectLabel(subject));
  }

  async updateDashboard(jwt: string, id: string, input: UpdateDashboard) {
    const { orgId, subject } = await this.resolveAuth(jwt);
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
    const { message, ...updates } = parsed;

    const changes: Record<string, unknown> = {};
    if (updates.title !== undefined) {
      changes['title'] = updates.title;
      changes['slug'] = slugify(updates.title);
    }
    if (updates.folderId !== undefined) changes['folderId'] = updates.folderId;
    if (updates.description !== undefined) changes['description'] = updates.description;
    if (updates.tags !== undefined) changes['tags'] = updates.tags;
    if (updates.panels !== undefined) changes['panels'] = updates.panels;
    if (updates.variables !== undefined) changes['variables'] = updates.variables;
    if (updates.timeRange !== undefined) changes['timeRange'] = updates.timeRange;

    try {
      // One atomic batch — a dashboard update can never land without its
      // version row. The version row's `version` reads the post-UPDATE value
      // via subselect so concurrent saves can't collide on it (the JSON
      // snapshot may lag one save behind in that race).
      await this.db.batch([
        this.db
          .update(dashboards)
          .set({ ...changes, updatedAt: now, version: sql`version + 1` })
          .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId))),
        this.db.insert(dashboardVersions).values({
          id: crypto.randomUUID(),
          dashboardId: id,
          version: sql`(select version from ${dashboards} where ${dashboards.id} = ${id})`,
          data: JSON.stringify({ ...current, ...changes, version: current.version + 1, updatedAt: now }),
          message: message ?? '',
          createdBy: subjectLabel(subject),
          createdAt: now,
        }),
      ]);

      const updated = await this.db
        .select()
        .from(dashboards)
        .where(and(eq(dashboards.id, id), eq(dashboards.orgId, orgId)))
        .limit(1);
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
    const { orgId, subject } = await this.resolveAuth(jwt);
    dashboardIdSchema.parse(dashboardId);

    const existing = await this.db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.orgId, orgId)))
      .limit(1);

    const [current] = existing;
    if (current === undefined) return null;

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
    const now = new Date();

    const changes: Record<string, unknown> = {};
    if ('title' in snapshot && typeof snapshot.title === 'string') changes['title'] = snapshot.title;
    if ('slug' in snapshot && typeof snapshot.slug === 'string') changes['slug'] = snapshot.slug;
    if ('description' in snapshot && typeof snapshot.description === 'string') changes['description'] = snapshot.description;
    if ('tags' in snapshot && Array.isArray(snapshot.tags)) changes['tags'] = snapshot.tags;
    if ('panels' in snapshot && Array.isArray(snapshot.panels)) changes['panels'] = snapshot.panels;
    if ('variables' in snapshot && Array.isArray(snapshot.variables)) changes['variables'] = snapshot.variables;
    if ('timeRange' in snapshot && typeof snapshot.timeRange === 'object' && snapshot.timeRange !== null) {
      changes['timeRange'] = snapshot.timeRange;
    }
    if ('folderId' in snapshot) changes['folderId'] = snapshot.folderId;

    try {
      // Same atomic update+version-row batch as updateDashboard.
      await this.db.batch([
        this.db
          .update(dashboards)
          .set({ ...changes, updatedAt: now, version: sql`version + 1` })
          .where(and(eq(dashboards.id, dashboardId), eq(dashboards.orgId, orgId))),
        this.db.insert(dashboardVersions).values({
          id: crypto.randomUUID(),
          dashboardId,
          version: sql`(select version from ${dashboards} where ${dashboards.id} = ${dashboardId})`,
          data: JSON.stringify({ ...current, ...changes, version: current.version + 1, updatedAt: now }),
          message: `Restored from version ${version}`,
          createdBy: subjectLabel(subject),
          createdAt: now,
        }),
      ]);

      const updated = await this.db
        .select()
        .from(dashboards)
        .where(and(eq(dashboards.id, dashboardId), eq(dashboards.orgId, orgId)))
        .limit(1);
      return updated[0] ?? null;
    } catch (error) {
      console.error('restoreDashboardVersion failed:', error);
      throw new Error('Failed to restore dashboard version', { cause: error });
    }
  }

  async importDashboard(jwt: string, input: ImportDashboard) {
    const { orgId, subject } = await this.resolveAuth(jwt);
    const parsed = importDashboardSchema.parse(input);

    const format = parsed.format ?? detectFormat(parsed.json);
    const { dashboard: imported, warnings } = importDashboardFn(parsed.json, format);

    const dashboard = await this.insertDashboardWithVersion(
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
      subjectLabel(subject),
    );

    return { dashboard, warnings };
  }

  // --- Alert Rule Group RPC ---

  async listAlertRuleGroups(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(alertRuleGroups).where(eq(alertRuleGroups.orgId, orgId));
  }

  async getAlertRuleGroup(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return getRuleGroup(this.db, orgId, id);
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
    return updateRuleGroup(this.ruleDeps, orgId, id, input);
  }

  async deleteAlertRuleGroup(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    await deleteRuleGroup(this.ruleDeps, orgId, id);
  }

  // --- Alert Rule RPC ---

  async listAlertRules(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return this.db.select().from(alertRules).where(eq(alertRules.orgId, orgId));
  }

  async getAlertRule(jwt: string, id: string) {
    const { orgId } = await this.resolveAuth(jwt);
    return getRule(this.db, orgId, id);
  }

  async createAlertRule(jwt: string, input: CreateAlertRule) {
    const { orgId } = await this.resolveAuth(jwt);
    return createRule(this.ruleDeps, orgId, input);
  }

  async updateAlertRule(jwt: string, id: string, input: UpdateAlertRule) {
    const { orgId } = await this.resolveAuth(jwt);
    return updateRule(this.ruleDeps, orgId, id, input);
  }

  async deleteAlertRule(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    await deleteRule(this.ruleDeps, orgId, id);
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
    const rows = instances.map(inst => {
      const parsed = upsertAlertInstanceSchema.parse(inst);
      return {
        id: crypto.randomUUID(),
        orgId,
        ruleId: parsed.ruleId,
        labelsHash: parsed.labelsHash,
        labels: parsed.labels ?? {},
        state: parsed.state,
        value: parsed.value,
        activeAt: parsed.activeAt === null ? null : new Date(parsed.activeAt),
        lastEvalAt: new Date(parsed.lastEvalAt),
      };
    });

    const [first, ...rest] = rows.map(row =>
      this.db
        .insert(alertInstances)
        .values(row)
        .onConflictDoUpdate({
          target: [alertInstances.ruleId, alertInstances.labelsHash],
          set: { labels: row.labels, state: row.state, value: row.value, activeAt: row.activeAt, lastEvalAt: row.lastEvalAt },
        }),
    );
    if (first === undefined) return;

    try {
      // One atomic round trip instead of N parallel D1 calls — an evaluation
      // cycle's instance states land together or not at all.
      await this.db.batch([first, ...rest]);
    } catch (error) {
      console.error('upsertAlertInstances failed:', error);
      throw new Error('Failed to upsert alert instances', { cause: error });
    }
  }

  // --- Contact Point RPC ---

  async listContactPoints(jwt: string) {
    const { orgId } = await this.resolveAuth(jwt);
    const rows = await this.db.select().from(contactPoints).where(eq(contactPoints.orgId, orgId));
    return rows.map(r => ({ ...r, settings: redactSecret(r.settings) }));
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
    return { ...row, settings: redactSecret(row.settings) };
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
      const settings = await encryptSecret(parsed.settings, this.env.ENCRYPTION_KEY);

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

    const existingRows = await this.db
      .select()
      .from(contactPoints)
      .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
      .limit(1);
    const existingRow = existingRows[0] ?? null;
    if (existingRow === null) return null;

    const setData: Record<string, unknown> = { updatedAt: now };
    if (parsed.name !== undefined) setData['name'] = parsed.name;
    if (parsed.type !== undefined) setData['type'] = parsed.type;

    try {
      if (parsed.settings !== undefined) {
        setData['settings'] = await resolveSecretOnUpdate(parsed.settings, existingRow.settings, this.env.ENCRYPTION_KEY);
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

    const rows = await this.db
      .select()
      .from(notificationPolicies)
      .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)))
      .limit(1);
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
    if (parsed?.tag !== undefined) conditions.push(sql`exists (select 1 from json_each(${annotations.tags}) where value = ${parsed.tag})`);

    return this.db
      .select()
      .from(annotations)
      .where(and(...conditions));
  }

  async createAnnotation(jwt: string, input: CreateAnnotation) {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createAnnotationSchema.parse(input);
    const id = crypto.randomUUID();
    const now = new Date();

    if (parsed.dashboardId !== undefined) {
      const dash = await this.db
        .select({ id: dashboards.id })
        .from(dashboards)
        .where(and(eq(dashboards.id, parsed.dashboardId), eq(dashboards.orgId, orgId)))
        .limit(1);
      if (dash.length === 0) throw new Error('Dashboard not found');
    }
    if (parsed.alertRuleId !== undefined) {
      const rule = await this.db
        .select({ id: alertRules.id })
        .from(alertRules)
        .where(and(eq(alertRules.id, parsed.alertRuleId), eq(alertRules.orgId, orgId)))
        .limit(1);
      if (rule.length === 0) throw new Error('Alert rule not found');
    }

    try {
      await this.db.insert(annotations).values({
        id,
        orgId,
        dashboardId: parsed.dashboardId,
        panelId: parsed.panelId,
        alertRuleId: parsed.alertRuleId,
        time: new Date(parsed.time),
        timeEnd: parsed.timeEnd === undefined ? undefined : new Date(parsed.timeEnd),
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

  // --- Access Service Token RPC ---
  //
  // Cloudflare creates and validates the secret; we persist only the public
  // link (org → client_id + cf token id). The `client_secret` is surfaced to the
  // caller exactly once, by createServiceToken, and is never stored or re-read.

  async listServiceTokens(jwt: string): Promise<ServiceTokenMetadata[]> {
    const { orgId } = await this.resolveAuth(jwt);
    const rows = await this.db
      .select({
        id: accessServiceTokens.id,
        clientId: accessServiceTokens.clientId,
        name: accessServiceTokens.name,
        createdAt: accessServiceTokens.createdAt,
        expiresAt: accessServiceTokens.expiresAt,
      })
      .from(accessServiceTokens)
      .where(eq(accessServiceTokens.orgId, orgId));

    // timestamp_ms columns come back as Date; the metadata contract is epoch ms.
    return rows.map(row => ({
      id: row.id,
      clientId: row.clientId,
      name: row.name,
      createdAt: row.createdAt.getTime(),
      expiresAt: row.expiresAt === null ? null : row.expiresAt.getTime(),
    }));
  }

  async createServiceToken(jwt: string, input: CreateServiceToken): Promise<ServiceTokenCreateResult> {
    const { orgId } = await this.resolveAuth(jwt);
    const parsed = createServiceTokenSchema.parse(input);

    const created = await this.#serviceTokens().create(parsed);

    const id = crypto.randomUUID();
    const createdAt = new Date();
    const expiresAt = created.expires_at === undefined ? null : new Date(created.expires_at);

    try {
      await this.db.insert(accessServiceTokens).values({
        id,
        orgId,
        cfTokenId: created.id,
        clientId: created.client_id,
        name: created.name,
        createdAt,
        expiresAt,
      });
    } catch (error) {
      // The CF token exists but its link row didn't persist — it would be
      // orphaned (unlistable, unrevokable from the UI) yet still a live
      // credential. Best-effort revoke it at Cloudflare; if that also fails,
      // log the cf token id (NOT a secret) for manual cleanup.
      console.error('createServiceToken: link insert failed; rolling back CF token', created.id, error);
      try {
        await this.#serviceTokens().delete(created.id);
      } catch (rollbackError) {
        console.error('createServiceToken: rollback of orphaned CF token failed; manual cleanup needed for', created.id, rollbackError);
      }
      throw new Error('Failed to create service token', { cause: error });
    }

    // The secret is returned ONCE here and never persisted.
    return {
      id,
      clientId: created.client_id,
      name: created.name,
      createdAt: createdAt.getTime(),
      expiresAt: expiresAt === null ? null : expiresAt.getTime(),
      clientSecret: created.client_secret,
    };
  }

  async revokeServiceToken(jwt: string, id: string): Promise<void> {
    const { orgId } = await this.resolveAuth(jwt);
    serviceTokenIdParamSchema.parse({ id });

    const rows = await this.db
      .select({ cfTokenId: accessServiceTokens.cfTokenId })
      .from(accessServiceTokens)
      .where(and(eq(accessServiceTokens.id, id), eq(accessServiceTokens.orgId, orgId)))
      .limit(1);

    const [row] = rows;
    if (row === undefined) {
      // Not found for this org — no cross-org revoke, no Cloudflare call.
      return;
    }

    try {
      await this.#serviceTokens().delete(row.cfTokenId);
      await this.db.delete(accessServiceTokens).where(and(eq(accessServiceTokens.id, id), eq(accessServiceTokens.orgId, orgId)));
    } catch (error) {
      console.error('revokeServiceToken failed:', error);
      throw new Error('Failed to revoke service token', { cause: error });
    }
  }
}

export { AlertRuleDO } from './alerting/alert-rule-do';
export { NotificationWorkflow } from './alerting/notification-workflow';
