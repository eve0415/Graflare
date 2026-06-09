import type { AppEnv } from './index';

import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from './db';
import { folders, notificationPolicies, organizations } from './db/schema';

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
  await db.delete(folders);
  await db.delete(notificationPolicies);
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
});
