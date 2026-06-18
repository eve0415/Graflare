import type { AppEnv } from './index';

import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from './db';
import {
  alertRuleGroups,
  alertRules,
  contactPoints,
  dashboards,
  datasources,
  folders,
  muteTimings,
  notificationPolicies,
  organizations,
  silences,
} from './db/schema';

import { GraflareAPI } from './index';

// Cross-tenant isolation regression for the GraflareAPI RPC methods. The update
// methods mutate org-scoped (WHERE id = ? AND orgId = ?), so a foreign-id update
// no-ops — but the read-back must ALSO be org-scoped, or it returns another
// org's row (a cross-tenant read gated only on knowing the UUID). The Hono
// routes already do this correctly; these prove the RPC path matches.

const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));
const VICTIM_EMAIL = 'victim@example.com';
const ATTACKER_EMAIL = 'attacker@example.com';

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

const makeApi = (devEmail: string): GraflareAPI => new GraflareAPI(createExecutionContext(), { ...testBindings, DEV_AUTH_EMAIL: devEmail });

const VICTIM_ORG = 'org-cccccccccccccccccccccccccccccccc';

const resetDb = async (): Promise<void> => {
  const db = createDb(env.DB);
  // Delete children before parents (FK order), org last.
  await db.delete(alertRules);
  await db.delete(alertRuleGroups);
  await db.delete(notificationPolicies);
  await db.delete(contactPoints);
  await db.delete(dashboards);
  await db.delete(folders);
  await db.delete(silences);
  await db.delete(muteTimings);
  await db.delete(datasources);
  await db.delete(organizations);
};

describe('cross-tenant isolation: RPC update read-backs are org-scoped', () => {
  beforeEach(async () => {
    await resetDb();
    const db = createDb(env.DB);
    const now = new Date();
    await db.insert(organizations).values({ id: VICTIM_ORG, name: VICTIM_EMAIL, createdAt: now, updatedAt: now });
  });

  it('updateFolder does not return another org folder (no-op update, null read-back)', async () => {
    const folderId = crypto.randomUUID();
    const now = new Date();
    await createDb(env.DB)
      .insert(folders)
      .values({ id: folderId, orgId: VICTIM_ORG, parentId: null, title: 'victim-folder', slug: 'victim-folder', createdAt: now, updatedAt: now });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateFolder('jwt', folderId, { title: 'pwned' });

    expect(result).toBeNull();
    const rows = await createDb(env.DB).select().from(folders).where(eq(folders.id, folderId));
    expect(rows[0]?.title).toBe('victim-folder');
  });

  it('updateNotificationPolicy does not return another org policy (no-op update, null read-back)', async () => {
    const policyId = crypto.randomUUID();
    const now = new Date();
    await createDb(env.DB)
      .insert(notificationPolicies)
      .values({
        id: policyId,
        orgId: VICTIM_ORG,
        parentId: null,
        contactPointId: null,
        groupBy: ['alertname'],
        matchers: [],
        muteTimingIds: [],
        groupWaitS: 30,
        groupIntervalS: 300,
        repeatIntervalS: 14400,
        continueMatching: false,
        createdAt: now,
        updatedAt: now,
      });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateNotificationPolicy('jwt', policyId, { groupWaitS: 999 });

    expect(result).toBeNull();
    const rows = await createDb(env.DB).select().from(notificationPolicies).where(eq(notificationPolicies.id, policyId));
    expect(rows[0]?.groupWaitS).toBe(30);
  });

  it('updateDatasource does not return another org datasource', async () => {
    const dsId = crypto.randomUUID();
    const now = new Date();
    await createDb(env.DB)
      .insert(datasources)
      .values({ id: dsId, orgId: VICTIM_ORG, name: 'victim-ds', type: 'prometheus', url: 'https://victim.test', createdAt: now, updatedAt: now });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateDatasource('jwt', dsId, { name: 'pwned' });

    expect(result).toBeNull();
    const rows = await createDb(env.DB).select().from(datasources).where(eq(datasources.id, dsId));
    expect(rows[0]?.name).toBe('victim-ds');
  });

  it('updateContactPoint does not return another org contact point', async () => {
    const cpId = crypto.randomUUID();
    const now = new Date();
    await createDb(env.DB)
      .insert(contactPoints)
      .values({
        id: cpId,
        orgId: VICTIM_ORG,
        name: 'victim-cp',
        type: 'webhook',
        settings: { type: 'webhook', url: 'https://victim.test/hook', method: 'POST', username: '', password: '' },
        createdAt: now,
        updatedAt: now,
      });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateContactPoint('jwt', cpId, { name: 'pwned' });

    expect(result).toBeNull();
    const rows = await createDb(env.DB).select().from(contactPoints).where(eq(contactPoints.id, cpId));
    expect(rows[0]?.name).toBe('victim-cp');
  });

  it('updateSilence does not return another org silence', async () => {
    const silenceId = crypto.randomUUID();
    const now = new Date();
    await createDb(env.DB)
      .insert(silences)
      .values({
        id: silenceId,
        orgId: VICTIM_ORG,
        matchers: [{ name: 'alertname', operator: '=', value: 'victim' }],
        startsAt: now,
        endsAt: new Date(now.getTime() + 60_000),
        comment: 'victim',
        createdBy: 'victim',
        createdAt: now,
        updatedAt: now,
      });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateSilence('jwt', silenceId, { comment: 'pwned' });

    expect(result).toBeNull();
    const rows = await createDb(env.DB).select().from(silences).where(eq(silences.id, silenceId));
    expect(rows[0]?.comment).toBe('victim');
  });

  it('updateMuteTiming does not return another org mute timing', async () => {
    const mtId = crypto.randomUUID();
    const now = new Date();
    await createDb(env.DB).insert(muteTimings).values({ id: mtId, orgId: VICTIM_ORG, name: 'victim-mt', intervals: [], createdAt: now, updatedAt: now });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateMuteTiming('jwt', mtId, { name: 'pwned' });

    expect(result).toBeNull();
    const rows = await createDb(env.DB).select().from(muteTimings).where(eq(muteTimings.id, mtId));
    expect(rows[0]?.name).toBe('victim-mt');
  });

  it('updateDashboard does not return another org dashboard', async () => {
    const dashId = crypto.randomUUID();
    const now = new Date();
    await createDb(env.DB)
      .insert(dashboards)
      .values({ id: dashId, orgId: VICTIM_ORG, title: 'victim-dash', slug: 'victim-dash', createdAt: now, updatedAt: now });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateDashboard('jwt', dashId, { title: 'pwned', message: '' });

    expect(result).toBeNull();
    const rows = await createDb(env.DB).select().from(dashboards).where(eq(dashboards.id, dashId));
    expect(rows[0]?.title).toBe('victim-dash');
  });

  it('updateAlertRule does not return another org alert rule', async () => {
    const groupId = crypto.randomUUID();
    const ruleId = crypto.randomUUID();
    const now = new Date();
    const db = createDb(env.DB);
    await db.insert(alertRuleGroups).values({ id: groupId, orgId: VICTIM_ORG, name: 'victim-grp', evalIntervalS: 60, createdAt: now, updatedAt: now });
    await db.insert(alertRules).values({
      id: ruleId,
      orgId: VICTIM_ORG,
      groupId,
      title: 'victim-rule',
      condition: { refId: 'A', reducer: 'last', operator: 'gt', threshold: 0 },
      createdAt: now,
      updatedAt: now,
    });

    const attacker = makeApi(ATTACKER_EMAIL);
    const result = await attacker.updateAlertRule('jwt', ruleId, { title: 'pwned' });

    expect(result).toBeNull();
    const rows = await db.select().from(alertRules).where(eq(alertRules.id, ruleId));
    expect(rows[0]?.title).toBe('victim-rule');
  });
});
