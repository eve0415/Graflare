import type { AlertCondition, AlertInstanceState, AlertQuery, ExecErrState, NoDataState } from '@graflare/shared/schemas/alerting';

import { evaluateCondition } from '@graflare/shared/alerting/evaluate';
import { labelsMapSchema } from '@graflare/shared/schemas/alerting';
import { DurableObject } from 'cloudflare:workers';

import { createPrometheusClient } from '../prometheus/factory';

const ALERT_INSTANCE_STATES = new Set(['Normal', 'Pending', 'Firing', 'Resolved']);

const isAlertInstanceState = (s: string): s is AlertInstanceState => ALERT_INSTANCE_STATES.has(s);

const isAlertRuleConfig = (raw: unknown): raw is AlertRuleConfig => {
  if (typeof raw !== 'object' || raw === null) return false;
  return (
    'orgId' in raw &&
    'ruleId' in raw &&
    'queries' in raw &&
    'condition' in raw &&
    'evalIntervalS' in raw &&
    'forDurationS' in raw &&
    'noDataState' in raw &&
    'execErrState' in raw
  );
};

interface AlertRuleConfig {
  orgId: string;
  ruleId: string;
  queries: AlertQuery[];
  condition: AlertCondition;
  evalIntervalS: number;
  forDurationS: number;
  noDataState: NoDataState;
  execErrState: ExecErrState;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface InstanceRow extends Record<string, SqlStorageValue> {
  labels_hash: string;
  labels: string;
  state: string;
  value: number | null;
  pending_since: number | null;
  fired_at: number | null;
  resolved_at: number | null;
  last_eval_at: number;
  last_notified_at: number | null;
}

interface Env {
  DB: D1Database;
  ENCRYPTION_KEY: string;
  NOTIFICATION_WORKFLOW: Workflow;
}

export class AlertRuleDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void this.ctx.blockConcurrencyWhile(() => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
          id INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      const applied = this.ctx.storage.sql.exec<{ id: number }>('SELECT id FROM _sql_schema_migrations WHERE id = 1').toArray();
      if (applied.length === 0) {
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS instances (
            labels_hash TEXT PRIMARY KEY,
            labels TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'Normal',
            value REAL,
            pending_since INTEGER,
            fired_at INTEGER,
            resolved_at INTEGER,
            last_eval_at INTEGER NOT NULL,
            last_notified_at INTEGER
          )
        `);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
        this.ctx.storage.sql.exec('INSERT INTO _sql_schema_migrations (id) VALUES (1)');
      }
      return Promise.resolve();
    });
  }

  async init(config: AlertRuleConfig): Promise<void> {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('rule_config', ?)", JSON.stringify(config));
    await this.ctx.storage.setAlarm(Date.now() + config.evalIntervalS * 1000);
  }

  async updateConfig(config: AlertRuleConfig): Promise<void> {
    const existingRaw = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM config WHERE key = 'rule_config'").toArray();

    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES ('rule_config', ?)", JSON.stringify(config));

    const [existingRow] = existingRaw;
    if (existingRow !== undefined) {
      const existing: unknown = JSON.parse(existingRow.value);
      if (typeof existing === 'object' && existing !== null && 'evalIntervalS' in existing && existing.evalIntervalS !== config.evalIntervalS) {
        await this.ctx.storage.setAlarm(Date.now() + config.evalIntervalS * 1000);
      }
    }
  }

  async stop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.sql.exec("DELETE FROM config WHERE key = 'rule_config'");
    this.ctx.storage.sql.exec('DELETE FROM instances');
  }

  getState(): InstanceRow[] {
    return this.ctx.storage.sql.exec<InstanceRow>('SELECT * FROM instances').toArray();
  }

  override async alarm(): Promise<void> {
    const configRows = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM config WHERE key = 'rule_config'").toArray();

    const [configRow] = configRows;
    if (configRow === undefined) return;

    const configParsed: unknown = JSON.parse(configRow.value);
    if (!isAlertRuleConfig(configParsed)) return;
    const config = configParsed;
    const now = Date.now();

    try {
      const query = config.queries.find(q => q.refId === config.condition.refId);
      if (query === undefined) {
        await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
        return;
      }

      const client = await createPrometheusClient(this.env.DB, this.env.ENCRYPTION_KEY, config.orgId, query.datasourceId);
      if (client === null) {
        await this.handleError(config, now);
        await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
        return;
      }

      const response = await client.instantQuery(query.expr);

      if (response.status === 'error') {
        await this.handleError(config, now);
        await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
        return;
      }

      if (response.data === undefined) {
        await this.handleNoData(config, now);
        await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
        return;
      }

      const { data } = response;
      if (typeof data !== 'object' || data === null || !('resultType' in data)) {
        await this.handleNoData(config, now);
        await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
        return;
      }

      const queryData = data;
      const results = evaluateCondition(queryData, config.condition.reducer, config.condition.operator, config.condition.threshold);

      if (results.length === 0) {
        await this.handleNoData(config, now);
        await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
        return;
      }

      const seenHashes = new Set<string>();
      const pending: Promise<void>[] = [];

      for (const result of results) {
        seenHashes.add(result.labelsHash);
        const existing = this.ctx.storage.sql.exec<InstanceRow>('SELECT * FROM instances WHERE labels_hash = ?', result.labelsHash).toArray();

        const prev = existing[0] ?? null;
        const prevStateRaw = prev?.state ?? 'Normal';
        const prevState: AlertInstanceState = isAlertInstanceState(prevStateRaw) ? prevStateRaw : 'Normal';
        const newState = this.transitionState(prevState, result.firing, config.forDurationS, now, prev?.pending_since ?? null);

        if (prev === null) {
          this.ctx.storage.sql.exec(
            `INSERT INTO instances (labels_hash, labels, state, value, pending_since, fired_at, resolved_at, last_eval_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            result.labelsHash,
            JSON.stringify(result.labels),
            newState.state,
            result.value,
            newState.pendingSince,
            newState.firedAt,
            newState.resolvedAt,
            now,
          );
        } else {
          this.ctx.storage.sql.exec(
            `UPDATE instances SET labels = ?, state = ?, value = ?, pending_since = ?, fired_at = ?, resolved_at = ?, last_eval_at = ?
             WHERE labels_hash = ?`,
            JSON.stringify(result.labels),
            newState.state,
            result.value,
            newState.pendingSince,
            newState.firedAt ?? prev.fired_at,
            newState.resolvedAt,
            now,
            result.labelsHash,
          );
        }

        if (prevState !== newState.state) {
          const notify = newState.state === 'Firing' || newState.state === 'Resolved';
          pending.push(
            this.syncAndNotify(
              config,
              result.labelsHash,
              result.labels,
              newState.state,
              String(result.value),
              newState.firedAt ?? prev?.fired_at ?? null,
              now,
              notify,
            ),
          );
        }
      }

      const allInstances = this.ctx.storage.sql.exec<InstanceRow>('SELECT * FROM instances').toArray();
      for (const inst of allInstances) {
        if (!seenHashes.has(inst.labels_hash) && (inst.state === 'Firing' || inst.state === 'Pending')) {
          this.ctx.storage.sql.exec(
            "UPDATE instances SET state = 'Resolved', resolved_at = ?, last_eval_at = ? WHERE labels_hash = ?",
            now,
            now,
            inst.labels_hash,
          );
          const labels = labelsMapSchema.parse(JSON.parse(inst.labels));
          pending.push(this.syncAndNotify(config, inst.labels_hash, labels, 'Resolved', String(inst.value ?? 0), inst.fired_at, now, true));
        }
      }

      await Promise.all(pending);
      await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
    } catch {
      await this.handleError(config, now);
      await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
    }
  }

  private transitionState(
    prev: AlertInstanceState,
    firing: boolean,
    forDurationS: number,
    now: number,
    pendingSince: number | null,
  ): { state: AlertInstanceState; pendingSince: number | null; firedAt: number | null; resolvedAt: number | null } {
    if (firing) {
      switch (prev) {
        case 'Normal':
        case 'Resolved':
          if (forDurationS > 0) {
            return { state: 'Pending', pendingSince: now, firedAt: null, resolvedAt: null };
          }
          return { state: 'Firing', pendingSince: null, firedAt: now, resolvedAt: null };
        case 'Pending':
          if (pendingSince !== null && now - pendingSince >= forDurationS * 1000) {
            return { state: 'Firing', pendingSince: null, firedAt: now, resolvedAt: null };
          }
          return { state: 'Pending', pendingSince, firedAt: null, resolvedAt: null };
        case 'Firing':
          return { state: 'Firing', pendingSince: null, firedAt: null, resolvedAt: null };
      }
    }

    switch (prev) {
      case 'Firing':
        return { state: 'Resolved', pendingSince: null, firedAt: null, resolvedAt: now };
      case 'Pending':
        return { state: 'Normal', pendingSince: null, firedAt: null, resolvedAt: null };
      case 'Resolved':
        return { state: 'Normal', pendingSince: null, firedAt: null, resolvedAt: null };
      case 'Normal':
        return { state: 'Normal', pendingSince: null, firedAt: null, resolvedAt: null };
    }
  }

  private async handleNoData(config: AlertRuleConfig, now: number): Promise<void> {
    if (config.noDataState === 'KeepLastState') return;

    const targetState: AlertInstanceState = config.noDataState === 'Alerting' ? 'Firing' : 'Normal';
    const allInstances = this.ctx.storage.sql.exec<InstanceRow>('SELECT * FROM instances').toArray();

    const pending: Promise<void>[] = [];
    for (const inst of allInstances) {
      if (inst.state !== targetState) {
        this.ctx.storage.sql.exec('UPDATE instances SET state = ?, last_eval_at = ? WHERE labels_hash = ?', targetState, now, inst.labels_hash);
        const labels = labelsMapSchema.parse(JSON.parse(inst.labels));
        pending.push(this.syncInstanceToD1(config, inst.labels_hash, labels, targetState, String(inst.value ?? 0), inst.fired_at, now));
      }
    }
    await Promise.all(pending);
  }

  private async handleError(config: AlertRuleConfig, now: number): Promise<void> {
    if (config.execErrState === 'KeepLastState') return;
    await this.handleNoData({ ...config, noDataState: 'Alerting' }, now);
  }

  /** Sync one instance to D1, then optionally fire its notification — kept sequential per instance, parallel across instances. */
  private async syncAndNotify(
    config: AlertRuleConfig,
    labelsHash: string,
    labels: Record<string, string>,
    state: AlertInstanceState,
    value: string,
    activeAt: number | null,
    evalAt: number,
    notify: boolean,
  ): Promise<void> {
    await this.syncInstanceToD1(config, labelsHash, labels, state, value, activeAt, evalAt);
    if (notify) await this.triggerNotification(config);
  }

  private async syncInstanceToD1(
    config: AlertRuleConfig,
    labelsHash: string,
    labels: Record<string, string>,
    state: AlertInstanceState,
    value: string,
    activeAt: number | null,
    evalAt: number,
  ): Promise<void> {
    const stmt = this.env.DB.prepare(
      `INSERT INTO alert_instances (id, org_id, rule_id, labels_hash, labels, state, value, active_at, last_eval_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (rule_id, labels_hash) DO UPDATE SET
         labels = excluded.labels,
         state = excluded.state,
         value = excluded.value,
         active_at = excluded.active_at,
         last_eval_at = excluded.last_eval_at`,
    );

    await stmt.bind(crypto.randomUUID(), config.orgId, config.ruleId, labelsHash, JSON.stringify(labels), state, value, activeAt, evalAt).run();
  }

  private async triggerNotification(config: AlertRuleConfig): Promise<void> {
    try {
      await this.env.NOTIFICATION_WORKFLOW.create({
        params: {
          orgId: config.orgId,
          ruleId: config.ruleId,
          ruleName: config.annotations['summary'] ?? config.ruleId,
          ruleLabels: config.labels,
          ruleAnnotations: config.annotations,
          externalURL: '',
        },
      });
    } catch (error) {
      console.error('Failed to trigger notification workflow:', error);
    }
  }
}
