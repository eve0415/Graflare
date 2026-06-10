import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig, WorkflowStepContext } from 'cloudflare:workers';

import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from '../db';
import { alertInstances, alertRuleGroups, alertRules, contactPoints, muteTimings, notificationPolicies, organizations, silences } from '../db/schema';

import { NotificationWorkflow } from './notification-workflow';

// ---------------------------------------------------------------------------
// WorkflowEntrypoint test harness
//
// There is no first-party way to drive a WorkflowEntrypoint's `run()` directly with a
// mocked step (`introspectWorkflowInstance` drives the real engine via the binding).
// workerd's WorkflowEntrypoint constructor rejects the synthetic ExecutionContext from
// `createExecutionContext()`, so we instantiate the prototype without invoking that
// validating constructor and attach `env` ourselves (the workflow's `run` only reads
// `this.env`, never `this.ctx`). We then feed it a fake `step` that runs each `step.do`
// callback inline (recording its name) and turns `step.sleep` into a recorded no-op,
// leaving the real D1 (test miniflare binding) so every Drizzle query — and the
// org-scoping predicates we added — execute for real. Contact-point delivery is observed
// through a captured `globalThis.fetch` and `env.EMAIL.send`.
// ---------------------------------------------------------------------------

/**
 * Build an instance bound to a class's prototype without running its (ctx-validating)
 * constructor. The `instanceof` guard narrows the `unknown` from `Object.create` to `T`
 * with no cast and no `any` leaking into the return.
 */
const bareInstance = <T extends object>(ctor: abstract new (...args: never[]) => T): T => {
  // A construct signature's `.prototype` is typed `any`; route it through `unknown` and a
  // shape guard so nothing unsafe flows, then narrow the fresh object with `instanceof`.
  const proto: unknown = ctor.prototype;
  if (typeof proto !== 'object' || proto === null) throw new Error('bareInstance: constructor has no prototype object');
  const obj: unknown = Object.create(proto);
  if (obj instanceof ctor) return obj;
  throw new Error('bareInstance: prototype linkage failed');
};

interface StepRecord {
  doNames: string[];
  sleeps: { name: string; duration: string }[];
}

const makeFakeStep = (record: StepRecord): WorkflowStep => {
  const fakeContext: WorkflowStepContext = { step: { name: '', count: 0 }, attempt: 1, config: {} };

  const fake = {
    do<T>(name: string, arg2: WorkflowStepConfig | ((ctx: WorkflowStepContext) => Promise<T>), arg3?: (ctx: WorkflowStepContext) => Promise<T>): Promise<T> {
      record.doNames.push(name);
      const run = typeof arg2 === 'function' ? arg2 : arg3;
      if (run === undefined) return Promise.reject(new Error(`fake step.do(${name}) called without a callback`));
      return run(fakeContext);
    },
    sleep(name: string, duration: string): Promise<void> {
      record.sleeps.push({ name, duration });
      return Promise.resolve();
    },
    sleepUntil(_name: string, _timestamp: Date | number): Promise<void> {
      return Promise.resolve();
    },
    waitForEvent<T>(_name: string, _options: { type: string; timeout?: number }): Promise<{ payload: Readonly<T>; timestamp: Date; type: string }> {
      return Promise.reject(new Error('waitForEvent is not used by the notification workflow'));
    },
  };
  // The fake satisfies the public WorkflowStep surface structurally; the only friction is
  // `do`/`waitForEvent`'s overloaded+generic signatures, which a plain object can't restate.
  // @ts-expect-error -- test-only fake of an abstract platform class; behaviour is exercised, not the overload shape.
  const step: WorkflowStep = fake;
  return step;
};

const runWorkflow = async (params: {
  orgId: string;
  ruleId: string;
  ruleName: string;
  ruleLabels: Record<string, string>;
  ruleAnnotations: Record<string, string>;
  externalURL: string;
}): Promise<StepRecord> => {
  const record: StepRecord = { doNames: [], sleeps: [] };
  const workflow = bareInstance(NotificationWorkflow);
  // `env` is protected; defineProperty attaches it without the constructor (string key, no cast).
  Object.defineProperty(workflow, 'env', { value: env, writable: false, enumerable: false, configurable: true });
  const event: Readonly<WorkflowEvent<typeof params>> = {
    payload: params,
    timestamp: new Date(),
    instanceId: 'test-instance',
    workflowName: 'notification',
  };
  await workflow.run(event, makeFakeStep(record));
  // Every per-group step name must be unique within a run; collisions would make the
  // Workflow engine hand one group another group's memoized result.
  expect(new Set(record.doNames).size).toBe(record.doNames.length);
  return record;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-c3';
const RULE_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG_ID = 'org-c3-other';

const now = (): Date => new Date();

const seedOrg = async (orgId: string): Promise<void> => {
  const db = createDb(env.DB);
  await db.insert(organizations).values({ id: orgId, name: orgId, createdAt: now(), updatedAt: now() });
};

// alert_instances has FKs to organizations AND alert_rules — seed the rule (and its group)
// once so instance inserts satisfy the rule_id FK. The rule itself is owned by ORG_ID; the
// org-scoping test relies on the drain query's org predicate, not on per-org rule rows.
const seedRule = async (orgId: string, ruleId: string): Promise<void> => {
  const db = createDb(env.DB);
  const groupId = crypto.randomUUID();
  await db.insert(alertRuleGroups).values({ id: groupId, orgId, name: `grp-${ruleId}`, evalIntervalS: 60, createdAt: now(), updatedAt: now() });
  await db.insert(alertRules).values({
    id: ruleId,
    orgId,
    groupId,
    title: `rule-${ruleId}`,
    condition: { refId: 'A', reducer: 'last', operator: 'gt', threshold: 0 },
    createdAt: now(),
    updatedAt: now(),
  });
};

const seedContactPoint = async (orgId: string, name: string, settings: ContactPointSettings): Promise<string> => {
  const db = createDb(env.DB);
  const id = crypto.randomUUID();
  await db.insert(contactPoints).values({ id, orgId, name, type: settings.type, settings, createdAt: now(), updatedAt: now() });
  return id;
};

interface PolicySeed {
  orgId: string;
  parentId?: string | null;
  contactPointId?: string | null;
  groupBy?: string[];
  matchers?: { name: string; operator: '=' | '!=' | '=~' | '!~'; value: string }[];
  muteTimingIds?: string[];
  groupWaitS?: number;
  continueMatching?: boolean;
}

const seedPolicy = async (p: PolicySeed): Promise<string> => {
  const db = createDb(env.DB);
  const id = crypto.randomUUID();
  await db.insert(notificationPolicies).values({
    id,
    orgId: p.orgId,
    parentId: p.parentId ?? null,
    contactPointId: p.contactPointId ?? null,
    groupBy: p.groupBy ?? ['alertname'],
    matchers: p.matchers ?? [],
    muteTimingIds: p.muteTimingIds ?? [],
    groupWaitS: p.groupWaitS ?? 0,
    continueMatching: p.continueMatching ?? false,
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
};

const seedInstance = async (orgId: string, ruleId: string, labelsHash: string, labels: Record<string, string>, state = 'Firing'): Promise<void> => {
  const db = createDb(env.DB);
  await db.insert(alertInstances).values({
    id: crypto.randomUUID(),
    orgId,
    ruleId,
    labelsHash,
    labels,
    state,
    value: '1',
    activeAt: now(),
    lastEvalAt: now(),
  });
};

const baseParams = (over?: Partial<Parameters<typeof runWorkflow>[0]>): Parameters<typeof runWorkflow>[0] => ({
  orgId: ORG_ID,
  ruleId: RULE_ID,
  ruleName: 'C3 Rule',
  ruleLabels: { alertname: 'C3Rule' },
  ruleAnnotations: { summary: 'c3' },
  externalURL: 'https://graflare.test',
  ...over,
});

interface CapturedDelivery {
  url: string;
  /** Per-alert fingerprints (= labelsHash) carried in the webhook body, so a test can assert
   *  WHICH instances reached the receiver — not merely that the receiver was hit. */
  fingerprints: string[];
}

/** Pull `alerts[].fingerprint` out of a webhook body without any unsafe access. */
const fingerprintsOf = (body: unknown): string[] => {
  if (typeof body !== 'string') return [];
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null || !('alerts' in parsed)) return [];
  const { alerts } = parsed;
  if (!Array.isArray(alerts)) return [];
  const out: string[] = [];
  // `Array.isArray` narrows to `any[]`, so re-bind each element as `unknown` before narrowing.
  const items: unknown[] = alerts;
  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'fingerprint' in item && typeof item.fingerprint === 'string') out.push(item.fingerprint);
  }
  return out;
};

// Capture webhook deliveries (URL + the instance fingerprints in the body) so a test can
// assert both the routed contact point AND which instances were delivered to it.
const captureFetch = (): CapturedDelivery[] => {
  const deliveries: CapturedDelivery[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    deliveries.push({ url, fingerprints: fingerprintsOf(init?.body) });
    return Promise.resolve(new Response('ok', { status: 200 }));
  });
  return deliveries;
};

/** Convenience: just the delivered URLs, in order. */
const urlsOf = (deliveries: CapturedDelivery[]): string[] => deliveries.map(d => d.url);

describe('notification-workflow per-instance routing (C3)', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(alertInstances);
    await db.delete(silences);
    await db.delete(muteTimings);
    await db.delete(notificationPolicies);
    await db.delete(contactPoints);
    await db.delete(alertRules);
    await db.delete(alertRuleGroups);
    await db.delete(organizations);
    vi.restoreAllMocks();

    await seedOrg(ORG_ID);
    await seedRule(ORG_ID, RULE_ID);
  });

  it('routes an instance whose merged labels match a CHILD policy to the child contact point, not the rule-level parent', async () => {
    // Regression for C3: before the fix the policy was resolved ONCE by the rule labels
    // ({alertname:'C3Rule'}), which never match the child's `severity=critical` matcher,
    // so every instance went to the parent. The child matches only because we now route by
    // the instance's own `severity` label merged in.
    const parentCp = await seedContactPoint(ORG_ID, 'parent-cp', {
      type: 'webhook',
      url: 'https://hook.test/parent',
      method: 'POST',
      username: '',
      password: '',
    });
    const childCp = await seedContactPoint(ORG_ID, 'child-cp', { type: 'webhook', url: 'https://hook.test/child', method: 'POST', username: '', password: '' });
    const root = await seedPolicy({ orgId: ORG_ID, contactPointId: parentCp });
    await seedPolicy({ orgId: ORG_ID, parentId: root, contactPointId: childCp, matchers: [{ name: 'severity', operator: '=', value: 'critical' }] });

    // Instance carries severity=critical in its OWN labels (not the rule labels).
    await seedInstance(ORG_ID, RULE_ID, 'h1', { severity: 'critical' });

    const deliveries = captureFetch();
    await runWorkflow(baseParams());

    expect(urlsOf(deliveries)).toEqual(['https://hook.test/child']);
  });

  it('routes two instances of one rule with different labels to DIFFERENT contact points', async () => {
    const critCp = await seedContactPoint(ORG_ID, 'crit-cp', { type: 'webhook', url: 'https://hook.test/crit', method: 'POST', username: '', password: '' });
    const warnCp = await seedContactPoint(ORG_ID, 'warn-cp', { type: 'webhook', url: 'https://hook.test/warn', method: 'POST', username: '', password: '' });
    const root = await seedPolicy({ orgId: ORG_ID, contactPointId: critCp });
    await seedPolicy({ orgId: ORG_ID, parentId: root, contactPointId: warnCp, matchers: [{ name: 'severity', operator: '=', value: 'warning' }] });

    await seedInstance(ORG_ID, RULE_ID, 'h-crit', { severity: 'critical' });
    await seedInstance(ORG_ID, RULE_ID, 'h-warn', { severity: 'warning' });

    const deliveries = captureFetch();
    await runWorkflow(baseParams());

    // critical falls through to the root, warning hits the child — two distinct receivers.
    expect(new Set(urlsOf(deliveries))).toEqual(new Set(['https://hook.test/crit', 'https://hook.test/warn']));
    expect(urlsOf(deliveries)).toHaveLength(2);
  });

  it('continue matching delivers one instance to MULTIPLE contact points', async () => {
    const cpA = await seedContactPoint(ORG_ID, 'cp-a', { type: 'webhook', url: 'https://hook.test/a', method: 'POST', username: '', password: '' });
    const cpB = await seedContactPoint(ORG_ID, 'cp-b', { type: 'webhook', url: 'https://hook.test/b', method: 'POST', username: '', password: '' });
    const cpRoot = await seedContactPoint(ORG_ID, 'cp-root', { type: 'webhook', url: 'https://hook.test/root', method: 'POST', username: '', password: '' });
    const root = await seedPolicy({ orgId: ORG_ID, contactPointId: cpRoot });
    // Two siblings both match severity=critical; the first has continue=true so the second runs too.
    await seedPolicy({
      orgId: ORG_ID,
      parentId: root,
      contactPointId: cpA,
      matchers: [{ name: 'severity', operator: '=', value: 'critical' }],
      continueMatching: true,
    });
    await seedPolicy({ orgId: ORG_ID, parentId: root, contactPointId: cpB, matchers: [{ name: 'severity', operator: '=', value: 'critical' }] });

    await seedInstance(ORG_ID, RULE_ID, 'h1', { severity: 'critical' });

    const deliveries = captureFetch();
    await runWorkflow(baseParams());

    // continue ⇒ both siblings fire; the root does NOT also fire because a child matched.
    expect(new Set(urlsOf(deliveries))).toEqual(new Set(['https://hook.test/a', 'https://hook.test/b']));
    expect(urlsOf(deliveries)).toHaveLength(2);
  });

  it('groups same-receiver instances into ONE delivery', async () => {
    const cp = await seedContactPoint(ORG_ID, 'cp', { type: 'webhook', url: 'https://hook.test/grp', method: 'POST', username: '', password: '' });
    // group_by alertname only ⇒ both instances (same alertname via rule labels) collapse to one group.
    await seedPolicy({ orgId: ORG_ID, contactPointId: cp, groupBy: ['alertname'] });

    await seedInstance(ORG_ID, RULE_ID, 'h1', { severity: 'critical', instance: 'a' });
    await seedInstance(ORG_ID, RULE_ID, 'h2', { severity: 'critical', instance: 'b' });

    const deliveries = captureFetch();
    const record = await runWorkflow(baseParams());

    // One receiver, one group ⇒ exactly one HTTP delivery carrying BOTH alerts in its body.
    expect(urlsOf(deliveries)).toEqual(['https://hook.test/grp']);
    expect(record.doNames.filter(n => n.startsWith('deliver:'))).toHaveLength(1);
    const [delivery] = deliveries;
    expect(delivery?.fingerprints.slice().sort()).toEqual(['h1', 'h2']);
  });

  it('splits a group per group_by label value', async () => {
    const cp = await seedContactPoint(ORG_ID, 'cp', { type: 'webhook', url: 'https://hook.test/byinst', method: 'POST', username: '', password: '' });
    await seedPolicy({ orgId: ORG_ID, contactPointId: cp, groupBy: ['instance'] });

    await seedInstance(ORG_ID, RULE_ID, 'h1', { instance: 'a' });
    await seedInstance(ORG_ID, RULE_ID, 'h2', { instance: 'b' });

    const deliveries = captureFetch();
    const record = await runWorkflow(baseParams());

    // Same contact point, but two distinct `instance` values ⇒ two groups ⇒ two deliveries,
    // each body carrying exactly its own instance.
    expect(urlsOf(deliveries)).toEqual(['https://hook.test/byinst', 'https://hook.test/byinst']);
    expect(record.doNames.filter(n => n.startsWith('deliver:'))).toHaveLength(2);
    expect(deliveries.flatMap(d => d.fingerprints).sort()).toEqual(['h1', 'h2']);
    expect(deliveries.every(d => d.fingerprints.length === 1)).toBe(true);
  });

  it('drops a silenced instance per-instance while its sibling in the same group still delivers', async () => {
    const cp = await seedContactPoint(ORG_ID, 'cp', { type: 'webhook', url: 'https://hook.test/sil', method: 'POST', username: '', password: '' });
    // group_by alertname ⇒ both instances share one group, one receiver.
    await seedPolicy({ orgId: ORG_ID, contactPointId: cp, groupBy: ['alertname'] });

    await seedInstance(ORG_ID, RULE_ID, 'h-silenced', { severity: 'critical', team: 'silence-me' });
    await seedInstance(ORG_ID, RULE_ID, 'h-loud', { severity: 'critical', team: 'page-me' });

    // Active silence matching only the first instance's merged labels.
    const db = createDb(env.DB);
    await db.insert(silences).values({
      id: crypto.randomUUID(),
      orgId: ORG_ID,
      matchers: [{ name: 'team', operator: '=', value: 'silence-me' }],
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      comment: '',
      createdBy: '',
      createdAt: now(),
      updatedAt: now(),
    });

    const deliveries = captureFetch();
    await runWorkflow(baseParams());

    // The group still delivers (sibling survives), to the one receiver.
    expect(urlsOf(deliveries)).toEqual(['https://hook.test/sil']);
    // The delivered body must carry ONLY the surviving instance — this is what proves the
    // silence dropped per-instance. Asserting the URL alone wouldn't: both instances share
    // one group, so a no-op silence would still produce exactly this single delivery (just
    // with two alerts in the body). Checking fingerprints makes the drop observable.
    const [delivery] = deliveries;
    expect(delivery?.fingerprints).toEqual(['h-loud']);
  });

  it('silence that matches no instance leaves the full group intact (guards the assertion above)', async () => {
    // Mirror of the silence test with a non-matching silence, so the fingerprint assertion is
    // shown to actually depend on filtering: here BOTH instances must remain in the body.
    const cp = await seedContactPoint(ORG_ID, 'cp', { type: 'webhook', url: 'https://hook.test/both', method: 'POST', username: '', password: '' });
    await seedPolicy({ orgId: ORG_ID, contactPointId: cp, groupBy: ['alertname'] });

    await seedInstance(ORG_ID, RULE_ID, 'h-silenced', { severity: 'critical', team: 'silence-me' });
    await seedInstance(ORG_ID, RULE_ID, 'h-loud', { severity: 'critical', team: 'page-me' });

    const db = createDb(env.DB);
    await db.insert(silences).values({
      id: crypto.randomUUID(),
      orgId: ORG_ID,
      matchers: [{ name: 'team', operator: '=', value: 'nobody' }],
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      comment: '',
      createdBy: '',
      createdAt: now(),
      updatedAt: now(),
    });

    const deliveries = captureFetch();
    await runWorkflow(baseParams());

    expect(urlsOf(deliveries)).toEqual(['https://hook.test/both']);
    const [delivery] = deliveries;
    expect(delivery?.fingerprints.slice().sort()).toEqual(['h-loud', 'h-silenced']);
  });

  it('mute timing skips its group while another policy/group still delivers', async () => {
    // Build a mute window that always covers "now". The interval's timezone is UTC and
    // isMuted localizes to UTC, so derive the window from UTC hours (not local) — otherwise
    // the test is green only in a UTC sandbox and flakes elsewhere.
    const utcHour = new Date().getUTCHours();
    const startHH = String(utcHour).padStart(2, '0');
    const endHH = String((utcHour + 1) % 24).padStart(2, '0');
    const muteDb = createDb(env.DB);
    const muteId = crypto.randomUUID();
    await muteDb.insert(muteTimings).values({
      id: muteId,
      orgId: ORG_ID,
      name: 'always-now',
      intervals: [{ weekdays: [], startTime: `${startHH}:00`, endTime: `${endHH}:00`, months: [], timezone: 'UTC' }],
      createdAt: now(),
      updatedAt: now(),
    });

    const mutedCp = await seedContactPoint(ORG_ID, 'muted-cp', { type: 'webhook', url: 'https://hook.test/muted', method: 'POST', username: '', password: '' });
    const liveCp = await seedContactPoint(ORG_ID, 'live-cp', { type: 'webhook', url: 'https://hook.test/live', method: 'POST', username: '', password: '' });

    const root = await seedPolicy({ orgId: ORG_ID, contactPointId: liveCp });
    // The muted child routes severity=critical to a policy carrying the active mute timing.
    await seedPolicy({
      orgId: ORG_ID,
      parentId: root,
      contactPointId: mutedCp,
      matchers: [{ name: 'severity', operator: '=', value: 'critical' }],
      muteTimingIds: [muteId],
    });

    await seedInstance(ORG_ID, RULE_ID, 'h-muted', { severity: 'critical' });
    await seedInstance(ORG_ID, RULE_ID, 'h-live', { severity: 'warning' });

    const deliveries = captureFetch();
    await runWorkflow(baseParams());

    // The critical instance's group is muted; the warning instance (root policy) still delivers.
    expect(urlsOf(deliveries)).toEqual(['https://hook.test/live']);
  });

  it('regression: rule-level routing ignored instance labels — child severity now wins over the parent timezone', async () => {
    // Direct restatement of the C3 bug: a single rule, a single firing instance whose ONLY
    // distinguishing signal lives in instance labels. Old code matched on rule labels and
    // always picked the parent; the fix must pick the child.
    const parentCp = await seedContactPoint(ORG_ID, 'parent', { type: 'webhook', url: 'https://hook.test/parent', method: 'POST', username: '', password: '' });
    const pagerCp = await seedContactPoint(ORG_ID, 'pager', { type: 'webhook', url: 'https://hook.test/pager', method: 'POST', username: '', password: '' });
    const root = await seedPolicy({ orgId: ORG_ID, contactPointId: parentCp });
    await seedPolicy({ orgId: ORG_ID, parentId: root, contactPointId: pagerCp, matchers: [{ name: 'severity', operator: '=', value: 'page' }] });

    // Rule labels DO NOT carry severity — only the instance does.
    await seedInstance(ORG_ID, RULE_ID, 'h1', { severity: 'page' });

    const deliveries = captureFetch();
    await runWorkflow(baseParams({ ruleLabels: { alertname: 'C3Rule' } }));

    expect(urlsOf(deliveries)).toEqual(['https://hook.test/pager']);
  });

  it("org-scoping: drain ignores another org's instances and load-policies ignores another org's tree", async () => {
    await seedOrg(OTHER_ORG_ID);
    const cp = await seedContactPoint(ORG_ID, 'cp', { type: 'webhook', url: 'https://hook.test/mine', method: 'POST', username: '', password: '' });
    await seedPolicy({ orgId: ORG_ID, contactPointId: cp });

    // A foreign policy that, if leaked, would also fire; and a foreign instance on the same ruleId.
    const foreignCp = await seedContactPoint(OTHER_ORG_ID, 'foreign-cp', {
      type: 'webhook',
      url: 'https://hook.test/foreign',
      method: 'POST',
      username: '',
      password: '',
    });
    await seedPolicy({ orgId: OTHER_ORG_ID, contactPointId: foreignCp });
    await seedInstance(OTHER_ORG_ID, RULE_ID, 'foreign-h', { severity: 'critical' });

    await seedInstance(ORG_ID, RULE_ID, 'mine-h', { severity: 'critical' });

    const deliveries = captureFetch();
    await runWorkflow(baseParams());

    // Only our org's instance, routed by only our org's policy.
    expect(urlsOf(deliveries)).toEqual(['https://hook.test/mine']);
  });
});
