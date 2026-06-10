import type { AlertRuleDO } from '../../alerting/alert-rule-do';
import type { AppEnv } from '../../index';

import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { config as doConfigTable, instances as doInstances } from '../../alerting/do-schema';
import { createDb } from '../../db';
import { alertRuleGroups, alertRules, organizations } from '../../db/schema';

import { alertRuleRoutes } from './alert-rules';

const TEST_ORG_ID = 'org-test-123';

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32)))),
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', TEST_ORG_ID);
    c.set('user', { kind: 'user', email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', alertRuleRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const readId = (value: unknown): string => {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') {
    throw new Error('bad shape: missing string id');
  }
  return value.id;
};

// The DO's own view of a rule: the stored rule_config row and whether an
// evaluation alarm is scheduled. init() must produce both; stop() must clear both.
const readRuleDoState = async (ruleId: string): Promise<{ config: string | undefined; alarm: number | null }> => {
  const stub = env.ALERT_RULE.getByName(ruleId);
  return runInDurableObject<AlertRuleDO, { config: string | undefined; alarm: number | null }>(stub, async (_instance, state) => {
    const doDb = drizzle(state.storage, { schema: { instances: doInstances, config: doConfigTable } });
    const rows = doDb.select().from(doConfigTable).all();
    const alarm = await state.storage.getAlarm();
    return { config: rows[0]?.value, alarm };
  });
};

let testGroupId: string;

const ruleInput = (overrides?: Record<string, unknown>) => ({
  groupId: testGroupId,
  title: 'High CPU',
  queries: [{ refId: 'A', datasourceId: crypto.randomUUID(), expr: 'rate(cpu_usage[5m])' }],
  condition: { refId: 'A', reducer: 'last', operator: 'gt', threshold: 80 },
  ...overrides,
});

describe('alert-rule routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(alertRules);
    await db.delete(alertRuleGroups);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    testGroupId = crypto.randomUUID();
    await db.insert(alertRuleGroups).values({
      id: testGroupId,
      orgId: TEST_ORG_ID,
      name: 'test-group',
      evalIntervalS: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists rules (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a rule', async () => {
    const app = createApp();
    const res = await app.request(req('/', json(ruleInput())), {}, testBindings);
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('title', 'High CPU');
    expect(body).toHaveProperty('forDurationS', 0);
    expect(body).toHaveProperty('noDataState', 'Alerting');
    expect(body).toHaveProperty('isPaused', false);
  });

  it('rejects rule without queries', async () => {
    const app = createApp();
    const res = await app.request(req('/', json({ ...ruleInput(), queries: [] })), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('gets a rule by id', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput())), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('title', 'High CPU');
  });

  it('updates a rule', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput())), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(
      req(`/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Low CPU' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toHaveProperty('title', 'Low CPU');
  });

  it('deletes a rule', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput())), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    const getRes = await app.request(req(`/${id}`), {}, testBindings);
    expect(getRes.status).toBe(404);
  });

  it('cascade deletes rules when group deleted', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput())), {}, testBindings);
    expect(createRes.status).toBe(201);

    const db = createDb(env.DB);
    await db.delete(alertRuleGroups);

    const rows = await db.select().from(alertRules);
    expect(rows).toHaveLength(0);
  });

  // Regression: the HTTP routes used to write D1 only — a rule created over
  // HTTP never evaluated, and one deleted over HTTP kept its alarm forever.
  it('starts the evaluation DO when a rule is created', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput())), {}, testBindings);
    const id = readId(await createRes.json());

    const doState = await readRuleDoState(id);
    expect(doState.config).toBeDefined();
    expect(doState.alarm).not.toBeNull();
  });

  it('does not start the evaluation DO for a paused rule', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput({ isPaused: true }))), {}, testBindings);
    const id = readId(await createRes.json());

    const doState = await readRuleDoState(id);
    expect(doState.config).toBeUndefined();
    expect(doState.alarm).toBeNull();
  });

  it('stops the evaluation DO when a rule is paused', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput())), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(
      req(`/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPaused: true }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);

    const doState = await readRuleDoState(id);
    expect(doState.config).toBeUndefined();
    expect(doState.alarm).toBeNull();
  });

  it('stops the evaluation DO when a rule is deleted', async () => {
    const app = createApp();
    const createRes = await app.request(req('/', json(ruleInput())), {}, testBindings);
    const id = readId(await createRes.json());

    const res = await app.request(req(`/${id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    const doState = await readRuleDoState(id);
    expect(doState.config).toBeUndefined();
    expect(doState.alarm).toBeNull();
  });
});
