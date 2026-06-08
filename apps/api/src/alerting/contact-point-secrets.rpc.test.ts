import type { AppEnv } from '../index';
import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';

import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../db';
import { contactPoints, organizations } from '../db/schema';
import { GraflareAPI } from '../index';

const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));
const DEV_EMAIL = 'rpc-secrets-test@example.com';

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
  DEV_AUTH_EMAIL: DEV_EMAIL,
};

const makeApi = (): GraflareAPI => new GraflareAPI(createExecutionContext(), testBindings);

const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected defined value');
  return v;
};

/** Asserts the value is webhook settings and returns its (stored) password. */
const webhookPassword = (settings: ContactPointSettings | undefined): string => {
  if (settings?.type !== 'webhook') throw new Error('expected webhook settings');
  return settings.password;
};

/** Asserts the value is slack/discord settings and returns its (stored) webhookUrl. */
const webhookUrlOf = (settings: ContactPointSettings | undefined): string => {
  if (settings?.type !== 'slack' && settings?.type !== 'discord') throw new Error('expected slack/discord settings');
  return settings.webhookUrl;
};

const newWebhook = (password: string): CreateWebhookInput => ({
  name: 'Hook',
  type: 'webhook',
  settings: { type: 'webhook', url: 'https://hooks.example.com/a', method: 'POST', username: 'u', password },
});

interface CreateWebhookInput {
  name: string;
  type: 'webhook';
  settings: { type: 'webhook'; url: string; method: 'POST'; username: string; password: string };
}

const storedPassword = async (id: string): Promise<string> => {
  const rows = await createDb(env.DB).select().from(contactPoints).where(eq(contactPoints.id, id));
  return webhookPassword(rows[0]?.settings);
};

describe('contact-point RPC secret handling', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(contactPoints);
    await db.delete(organizations);
  });

  it('preserves the stored ciphertext when update resubmits the redaction sentinel', async () => {
    const api = makeApi();
    const created = must(await api.createContactPoint('jwt', newWebhook('secret')));
    const { id } = created;

    const before = await storedPassword(id);
    expect(before).not.toBe('secret');

    // Edit form resends the unchanged password as the sentinel; only the name changes.
    await api.updateContactPoint('jwt', id, {
      name: 'Hook Renamed',
      settings: { type: 'webhook', url: 'https://hooks.example.com/a', method: 'POST', username: 'u', password: '******' },
    });

    const renamed = await createDb(env.DB).select().from(contactPoints).where(eq(contactPoints.id, id));
    expect(renamed[0]?.name).toBe('Hook Renamed');
    // The stored ciphertext must be byte-for-byte unchanged — the sentinel must NOT be encrypted.
    expect(await storedPassword(id)).toBe(before);
  });

  it('re-encrypts when update submits a real new password', async () => {
    const api = makeApi();
    const created = must(await api.createContactPoint('jwt', newWebhook('secret')));
    const { id } = created;

    const before = await storedPassword(id);

    await api.updateContactPoint('jwt', id, {
      settings: { type: 'webhook', url: 'https://hooks.example.com/a', method: 'POST', username: 'u', password: 'rotated' },
    });

    const after = await storedPassword(id);
    expect(after).not.toBe(before);
    expect(after).not.toBe('rotated');
    expect(after).not.toBe('******');
  });

  it('redacts the password on the RPC read paths', async () => {
    const api = makeApi();
    const created = must(await api.createContactPoint('jwt', newWebhook('secret')));
    const { id } = created;

    expect(webhookPassword(created.settings)).toBe('******');

    const got = await api.getContactPoint('jwt', id);
    expect(webhookPassword(must(got).settings)).toBe('******');

    const listed = await api.listContactPoints('jwt');
    expect(webhookPassword(listed[0]?.settings)).toBe('******');
  });

  it('redacts the slack webhookUrl on the RPC read paths and never returns cleartext', async () => {
    const api = makeApi();
    const created = must(
      await api.createContactPoint('jwt', {
        name: 'Slack',
        type: 'slack',
        settings: { type: 'slack', webhookUrl: 'https://hooks.slack.com/services/T/B/x', channel: '#ops', username: '' },
      }),
    );
    const { id } = created;

    expect(webhookUrlOf(created.settings)).toBe('******');
    expect(webhookUrlOf(must(await api.getContactPoint('jwt', id)).settings)).toBe('******');
    const listed = await api.listContactPoints('jwt');
    expect(webhookUrlOf(listed[0]?.settings)).toBe('******');
  });

  it('redacts the discord webhookUrl on the RPC read paths and never returns cleartext', async () => {
    const api = makeApi();
    const created = must(
      await api.createContactPoint('jwt', {
        name: 'Discord',
        type: 'discord',
        settings: { type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/1/secret', username: '', avatarUrl: '' },
      }),
    );
    expect(webhookUrlOf(created.settings)).toBe('******');
    expect(webhookUrlOf(must(await api.getContactPoint('jwt', created.id)).settings)).toBe('******');
  });
});
