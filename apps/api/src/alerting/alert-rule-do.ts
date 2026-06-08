import type { AlertCondition, AlertInstanceState, AlertQuery, ExecErrState, NoDataState } from '@graflare/shared/schemas/alerting';
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';

import { evaluateCondition } from '@graflare/shared/alerting/evaluate';
import { labelsMapSchema } from '@graflare/shared/schemas/alerting';
import { DurableObject } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';

import migrations from '../../drizzle-do/migrations';
import { createDb } from '../db';
import { alertInstances } from '../db/schema';
import { createPrometheusClient } from '../prometheus/factory';

import { config as configTable, instances } from './do-schema';
import * as doSchema from './do-schema';

const RULE_CONFIG_KEY = 'rule_config';

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

/** A row from the DO's internal `instances` table as Drizzle selects it (camelCase). */
type InstanceSelect = typeof instances.$inferSelect;

/**
 * Public shape of an instance row. Keeps the original snake_case column names so
 * the DO's RPC contract (and its callers) stay unchanged after the move to Drizzle.
 */
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

const toInstanceRow = (row: InstanceSelect): InstanceRow => ({
  labels_hash: row.labelsHash,
  labels: row.labels,
  state: row.state,
  value: row.value,
  pending_since: row.pendingSince,
  fired_at: row.firedAt,
  resolved_at: row.resolvedAt,
  last_eval_at: row.lastEvalAt,
  last_notified_at: row.lastNotifiedAt,
});

// Extend the generated binding types so the env stays in sync with wrangler.json
// (DB, NOTIFICATION_WORKFLOW, …); ENCRYPTION_KEY is a secret, so it isn't generated.
interface Env extends Cloudflare.Env {
  ENCRYPTION_KEY: string;
}

export class AlertRuleDO extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase<typeof doSchema>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(this.ctx.storage, { schema: doSchema, logger: false });
    void this.ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  async init(config: AlertRuleConfig): Promise<void> {
    this.writeConfig(config);
    await this.ctx.storage.setAlarm(Date.now() + config.evalIntervalS * 1000);
  }

  async updateConfig(config: AlertRuleConfig): Promise<void> {
    const existingRow = this.db.select({ value: configTable.value }).from(configTable).where(eq(configTable.key, RULE_CONFIG_KEY)).get();

    this.writeConfig(config);

    if (existingRow !== undefined) {
      const existing: unknown = JSON.parse(existingRow.value);
      if (typeof existing === 'object' && existing !== null && 'evalIntervalS' in existing && existing.evalIntervalS !== config.evalIntervalS) {
        await this.ctx.storage.setAlarm(Date.now() + config.evalIntervalS * 1000);
      }
    }
  }

  async stop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    this.db.delete(configTable).where(eq(configTable.key, RULE_CONFIG_KEY)).run();
    this.db.delete(instances).run();
  }

  getState(): InstanceRow[] {
    return this.db
      .select()
      .from(instances)
      .all()
      .map(row => toInstanceRow(row));
  }

  override async alarm(): Promise<void> {
    const configRow = this.db.select({ value: configTable.value }).from(configTable).where(eq(configTable.key, RULE_CONFIG_KEY)).get();

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
        const prev = this.db.select().from(instances).where(eq(instances.labelsHash, result.labelsHash)).get() ?? null;

        const prevStateRaw = prev?.state ?? 'Normal';
        const prevState: AlertInstanceState = isAlertInstanceState(prevStateRaw) ? prevStateRaw : 'Normal';
        const newState = this.transitionState(prevState, result.firing, config.forDurationS, now, prev?.pendingSince ?? null);

        if (prev === null) {
          this.db
            .insert(instances)
            .values({
              labelsHash: result.labelsHash,
              labels: JSON.stringify(result.labels),
              state: newState.state,
              value: result.value,
              pendingSince: newState.pendingSince,
              firedAt: newState.firedAt,
              resolvedAt: newState.resolvedAt,
              lastEvalAt: now,
            })
            .run();
        } else {
          this.db
            .update(instances)
            .set({
              labels: JSON.stringify(result.labels),
              state: newState.state,
              value: result.value,
              pendingSince: newState.pendingSince,
              firedAt: newState.firedAt ?? prev.firedAt,
              resolvedAt: newState.resolvedAt,
              lastEvalAt: now,
            })
            .where(eq(instances.labelsHash, result.labelsHash))
            .run();
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
              newState.firedAt ?? prev?.firedAt ?? null,
              now,
              notify,
            ),
          );
        }
      }

      const allInstances = this.db.select().from(instances).all();
      for (const inst of allInstances) {
        if (!seenHashes.has(inst.labelsHash) && (inst.state === 'Firing' || inst.state === 'Pending')) {
          this.db.update(instances).set({ state: 'Resolved', resolvedAt: now, lastEvalAt: now }).where(eq(instances.labelsHash, inst.labelsHash)).run();
          const labels = labelsMapSchema.parse(JSON.parse(inst.labels));
          pending.push(this.syncAndNotify(config, inst.labelsHash, labels, 'Resolved', String(inst.value ?? 0), inst.firedAt, now, true));
        }
      }

      await Promise.all(pending);
      await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
    } catch {
      await this.handleError(config, now);
      await this.ctx.storage.setAlarm(now + config.evalIntervalS * 1000);
    }
  }

  private writeConfig(config: AlertRuleConfig): void {
    this.db
      .insert(configTable)
      .values({ key: RULE_CONFIG_KEY, value: JSON.stringify(config) })
      .onConflictDoUpdate({ target: configTable.key, set: { value: JSON.stringify(config) } })
      .run();
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
    // Escalating to Firing (noData/error → Alerting) is a real alert and must notify,
    // exactly like the normal-evaluation firing path. Going to Normal stays silent.
    const notify = targetState === 'Firing';
    const allInstances = this.db.select().from(instances).all();

    const pending: Promise<void>[] = [];
    for (const inst of allInstances) {
      if (inst.state !== targetState) {
        this.db.update(instances).set({ state: targetState, lastEvalAt: now }).where(eq(instances.labelsHash, inst.labelsHash)).run();
        const labels = labelsMapSchema.parse(JSON.parse(inst.labels));
        pending.push(this.syncAndNotify(config, inst.labelsHash, labels, targetState, String(inst.value ?? 0), inst.firedAt, now, notify));
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
    if (notify) {
      await this.triggerNotification(config);
      this.db.update(instances).set({ lastNotifiedAt: evalAt }).where(eq(instances.labelsHash, labelsHash)).run();
    }
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
    const activeAtDate = activeAt === null ? null : new Date(activeAt);
    const lastEvalDate = new Date(evalAt);

    await createDb(this.env.DB)
      .insert(alertInstances)
      .values({
        id: crypto.randomUUID(),
        orgId: config.orgId,
        ruleId: config.ruleId,
        labelsHash,
        labels,
        state,
        value,
        activeAt: activeAtDate,
        lastEvalAt: lastEvalDate,
      })
      .onConflictDoUpdate({
        target: [alertInstances.ruleId, alertInstances.labelsHash],
        set: { labels, state, value, activeAt: activeAtDate, lastEvalAt: lastEvalDate },
      });
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
