import type { AlertRuleDO } from './alert-rule-do';

import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../db';
import { alertInstances, alertRuleGroups, alertRules, organizations } from '../db/schema';

import { config as configTable, instances } from './do-schema';

const ORG_ID = 'org-c2';
const RULE_ID = 'rule-c2';

// A rule whose only query points at a datasource that does not exist, so the
// alarm's Prometheus client comes back null and evaluation takes the error
// branch (handleError → handleNoData with the Alerting state → instance Firing).
const errorRuleConfig = {
  orgId: ORG_ID,
  ruleId: RULE_ID,
  queries: [{ refId: 'A', datasourceId: '00000000-0000-0000-0000-000000000000', expr: 'up', legendFormat: '' }],
  condition: { refId: 'A', reducer: 'last', operator: 'gt', threshold: 0 },
  evalIntervalS: 60,
  forDurationS: 0,
  noDataState: 'OK',
  execErrState: 'Alerting',
  labels: { severity: 'critical' },
  annotations: { summary: 'C2 regression rule' },
};

const seedNormalInstance = (state: DurableObjectState, config: unknown): void => {
  const db = drizzle(state.storage, { schema: { instances, config: configTable } });
  db.insert(configTable)
    .values({ key: 'rule_config', value: JSON.stringify(config) })
    .run();
  db.insert(instances)
    .values({
      labelsHash: 'inst-1',
      labels: JSON.stringify({ alertname: 'C2', severity: 'critical' }),
      state: 'Normal',
      value: 1,
      lastEvalAt: 1000,
    })
    .run();
};

describe('alert-rule DO no-data/error notifications', () => {
  // The instance sync writes to alert_instances, which has FKs to organizations
  // and alert_rules — seed them so the sync (and thus the notification) can run.
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(alertInstances);
    await db.delete(alertRules);
    await db.delete(alertRuleGroups);
    await db.delete(organizations);

    const groupId = crypto.randomUUID();
    await db.insert(organizations).values({ id: ORG_ID, name: 'C2 Org', createdAt: new Date(), updatedAt: new Date() });
    await db.insert(alertRuleGroups).values({ id: groupId, orgId: ORG_ID, name: 'c2-group', evalIntervalS: 60, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(alertRules).values({
      id: RULE_ID,
      orgId: ORG_ID,
      groupId,
      title: 'C2 Rule',
      condition: { refId: 'A', reducer: 'last', operator: 'gt', threshold: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('notifies when an exec error escalates an instance to Firing', async () => {
    const id = env.ALERT_RULE.idFromName('c2-error-test');
    const stub = env.ALERT_RULE.get(id);

    await runInDurableObject<AlertRuleDO, void>(stub, async (instance, state) => {
      seedNormalInstance(state, errorRuleConfig);
      await instance.alarm();

      const [inst] = instance.getState();
      // The error escalated the instance to Firing...
      expect(inst?.state).toBe('Firing');
      // ...and that escalation must fire a notification (recorded via last_notified_at),
      // just like the normal-evaluation firing path. Before the fix this stayed null.
      expect(inst?.last_notified_at).not.toBeNull();
    });
  });

  it('does not re-notify an instance that is already Firing on a repeated error', async () => {
    const id = env.ALERT_RULE.idFromName('c2-already-firing-test');
    const stub = env.ALERT_RULE.get(id);

    await runInDurableObject<AlertRuleDO, void>(stub, async (instance, state) => {
      seedNormalInstance(state, errorRuleConfig);
      // Already Firing — a fresh error keeps it Firing and must not fire again.
      const db = drizzle(state.storage, { schema: { instances, config: configTable } });
      db.update(instances).set({ state: 'Firing' }).where(eq(instances.labelsHash, 'inst-1')).run();
      await instance.alarm();

      const [inst] = instance.getState();
      expect(inst?.state).toBe('Firing');
      expect(inst?.last_notified_at).toBeNull();
    });
  });
});
