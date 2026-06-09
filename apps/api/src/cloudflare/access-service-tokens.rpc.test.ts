import type { AppEnv } from '../index';
import type { ServiceTokenClient } from './access-service-tokens';
import type { CreateServiceToken, ServiceToken, ServiceTokenWithSecret } from '@graflare/shared/schemas/service-token';

import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from '../db';
import { accessServiceTokens, organizations } from '../db/schema';
import { GraflareAPI } from '../index';

const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));
const DEV_EMAIL = 'service-token-rpc@example.com';
const OTHER_EMAIL = 'other-org@example.com';

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
  DEV_AUTH_EMAIL: DEV_EMAIL,
};

const makeApi = (overrides?: Partial<AppEnv['Bindings']>): GraflareAPI => new GraflareAPI(createExecutionContext(), { ...testBindings, ...overrides });

const orgIdOf = async (email: string): Promise<string> => {
  const data = new TextEncoder().encode(email.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `org-${hex.slice(0, 32)}`;
};

const createResult: ServiceTokenWithSecret = {
  id: 'cf-tok-1',
  client_id: 'client-1',
  client_secret: 'the-secret',
  name: 'ci',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  expires_at: '2027-01-01T00:00:00Z',
  duration: '8760h',
};

type CreateFn = (input: CreateServiceToken) => Promise<ServiceTokenWithSecret>;
type ListFn = () => Promise<ServiceToken[]>;
type DeleteFn = (cfTokenId: string) => Promise<void>;

/** A spy-able client whose three mocks are standalone (so assertions never reference unbound members). */
interface SpyClient {
  client: ServiceTokenClient;
  create: ReturnType<typeof vi.fn<CreateFn>>;
  list: ReturnType<typeof vi.fn<ListFn>>;
  delete: ReturnType<typeof vi.fn<DeleteFn>>;
}

const spyClient = (createResolves: ServiceTokenWithSecret = createResult): SpyClient => {
  const create = vi.fn<CreateFn>(() => Promise.resolve(createResolves));
  const list = vi.fn<ListFn>(() => Promise.resolve([]));
  const del = vi.fn<DeleteFn>(() => Promise.resolve());
  return { client: { create, list, delete: del }, create, list, delete: del };
};

const must = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error('expected defined value');
  return v;
};

afterEach(() => {
  vi.restoreAllMocks();
});

const resetDb = async (): Promise<void> => {
  const db = createDb(env.DB);
  await db.delete(accessServiceTokens);
  await db.delete(organizations);
};

describe('createServiceToken RPC', () => {
  beforeEach(resetDb);

  it('returns the secret once and forwards name+duration to Cloudflare', async () => {
    const api = makeApi();
    const spy = spyClient();
    vi.spyOn(api, 'serviceTokens').mockReturnValue(spy.client);

    const result = await api.createServiceToken('jwt', { name: 'ci', duration: '8760h' });

    expect(result.clientSecret).toBe('the-secret');
    expect(result.clientId).toBe('client-1');
    expect(result.name).toBe('ci');
    expect(spy.create).toHaveBeenCalledWith({ name: 'ci', duration: '8760h' });
  });

  it('stores a link row that contains no secret', async () => {
    const api = makeApi();
    vi.spyOn(api, 'serviceTokens').mockReturnValue(spyClient().client);

    await api.createServiceToken('jwt', { name: 'ci' });

    const rows = await createDb(env.DB).select().from(accessServiceTokens);
    expect(rows).toHaveLength(1);
    const row = must(rows[0]);
    expect(row.cfTokenId).toBe('cf-tok-1');
    expect(row.clientId).toBe('client-1');
    expect(JSON.stringify(row)).not.toContain('the-secret');
    expect('clientSecret' in row).toBe(false);
    expect('client_secret' in row).toBe(false);
  });

  it('persists expiresAt as null when CF omits expires_at', async () => {
    const api = makeApi();
    const { expires_at: _e, ...noExpiry } = createResult;
    vi.spyOn(api, 'serviceTokens').mockReturnValue(spyClient(noExpiry).client);

    const result = await api.createServiceToken('jwt', { name: 'ci' });
    expect(result.expiresAt).toBeNull();

    const rows = await createDb(env.DB).select().from(accessServiceTokens);
    expect(must(rows[0]).expiresAt).toBeNull();
  });
});

describe('listServiceTokens RPC', () => {
  beforeEach(resetDb);

  it('returns metadata only — never a secret or cf token id', async () => {
    const api = makeApi();
    vi.spyOn(api, 'serviceTokens').mockReturnValue(spyClient().client);
    await api.createServiceToken('jwt', { name: 'ci' });

    const list = await api.listServiceTokens('jwt');
    expect(list).toHaveLength(1);
    const item = must(list[0]);
    expect(item.clientId).toBe('client-1');
    expect('clientSecret' in item).toBe(false);
    expect('client_secret' in item).toBe(false);
    expect('cfTokenId' in item).toBe(false);
    expect(JSON.stringify(list)).not.toContain('the-secret');
  });

  it('only returns the caller org rows', async () => {
    const mine = makeApi();
    vi.spyOn(mine, 'serviceTokens').mockReturnValue(spyClient().client);
    await mine.createServiceToken('jwt', { name: 'mine' });

    const theirs = makeApi({ DEV_AUTH_EMAIL: OTHER_EMAIL });
    vi.spyOn(theirs, 'serviceTokens').mockReturnValue(spyClient({ ...createResult, id: 'cf-tok-2', client_id: 'client-2' }).client);
    await theirs.createServiceToken('jwt', { name: 'theirs' });

    const mineList = await mine.listServiceTokens('jwt');
    expect(mineList).toHaveLength(1);
    expect(must(mineList[0]).clientId).toBe('client-1');
  });
});

describe('revokeServiceToken RPC', () => {
  beforeEach(resetDb);

  it('calls Cloudflare delete with the cf token id and removes the link', async () => {
    const api = makeApi();
    const spy = spyClient();
    vi.spyOn(api, 'serviceTokens').mockReturnValue(spy.client);
    const created = await api.createServiceToken('jwt', { name: 'ci' });

    await api.revokeServiceToken('jwt', created.id);

    expect(spy.delete).toHaveBeenCalledWith('cf-tok-1');
    expect(await createDb(env.DB).select().from(accessServiceTokens)).toHaveLength(0);
  });

  it('is org-scoped: another org cannot revoke (no CF delete, row preserved)', async () => {
    const mine = makeApi();
    vi.spyOn(mine, 'serviceTokens').mockReturnValue(spyClient().client);
    const created = await mine.createServiceToken('jwt', { name: 'mine' });

    const theirs = makeApi({ DEV_AUTH_EMAIL: OTHER_EMAIL });
    const theirsSpy = spyClient();
    vi.spyOn(theirs, 'serviceTokens').mockReturnValue(theirsSpy.client);

    await theirs.revokeServiceToken('jwt', created.id);

    expect(theirsSpy.delete).not.toHaveBeenCalled();
    const orgAId = await orgIdOf(DEV_EMAIL);
    const rows = await createDb(env.DB)
      .select()
      .from(accessServiceTokens)
      .where(and(eq(accessServiceTokens.id, created.id), eq(accessServiceTokens.orgId, orgAId)));
    expect(rows).toHaveLength(1);
  });
});
