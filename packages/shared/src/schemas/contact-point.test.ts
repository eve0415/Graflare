import type { ContactPointSettings } from './alerting';

import { describe, expect, it } from 'vitest';

import { contactPointSettingsSchema, contactPointType } from './alerting';

type SlackSettings = Extract<ContactPointSettings, { type: 'slack' }>;
type DiscordSettings = Extract<ContactPointSettings, { type: 'discord' }>;

const asSlack = (s: ContactPointSettings): SlackSettings => {
  if (s.type !== 'slack') throw new Error('expected slack settings');
  return s;
};

const asDiscord = (s: ContactPointSettings): DiscordSettings => {
  if (s.type !== 'discord') throw new Error('expected discord settings');
  return s;
};

describe('contactPointType', () => {
  it('includes slack and discord', () => {
    expect(contactPointType.safeParse('slack').success).toBe(true);
    expect(contactPointType.safeParse('discord').success).toBe(true);
  });
});

describe('contactPointSettingsSchema slack', () => {
  it('parses slack settings and infers the slack-specific fields', () => {
    const parsed = asSlack(
      contactPointSettingsSchema.parse({
        type: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        channel: '#alerts',
        username: 'Graflare',
      }),
    );
    expect(parsed.channel).toBe('#alerts');
    expect(parsed.username).toBe('Graflare');
  });

  it('defaults optional channel and username to empty strings', () => {
    const parsed = asSlack(contactPointSettingsSchema.parse({ type: 'slack', webhookUrl: 'https://hooks.slack.com/x' }));
    expect(parsed.channel).toBe('');
    expect(parsed.username).toBe('');
  });

  it('accepts the redaction sentinel as webhookUrl (it is a secret, not a URL field)', () => {
    expect(contactPointSettingsSchema.safeParse({ type: 'slack', webhookUrl: '******' }).success).toBe(true);
  });

  it('accepts base64 ciphertext as webhookUrl so stored rows re-parse', () => {
    expect(contactPointSettingsSchema.safeParse({ type: 'slack', webhookUrl: 'aGVsbG8gd29ybGQ=' }).success).toBe(true);
  });

  it('rejects a webhookUrl over 2048 chars', () => {
    expect(contactPointSettingsSchema.safeParse({ type: 'slack', webhookUrl: 'x'.repeat(2049) }).success).toBe(false);
  });
});

describe('contactPointSettingsSchema discord', () => {
  it('parses discord settings and infers the discord-specific fields', () => {
    const parsed = asDiscord(
      contactPointSettingsSchema.parse({
        type: 'discord',
        webhookUrl: 'https://discord.com/api/webhooks/1/x',
        username: 'Graflare',
        avatarUrl: 'https://example.com/a.png',
      }),
    );
    expect(parsed.username).toBe('Graflare');
    expect(parsed.avatarUrl).toBe('https://example.com/a.png');
  });

  it('defaults optional username and avatarUrl to empty strings', () => {
    const parsed = asDiscord(contactPointSettingsSchema.parse({ type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/1/x' }));
    expect(parsed.username).toBe('');
    expect(parsed.avatarUrl).toBe('');
  });

  it('accepts the redaction sentinel and base64 ciphertext as webhookUrl', () => {
    expect(contactPointSettingsSchema.safeParse({ type: 'discord', webhookUrl: '******' }).success).toBe(true);
    expect(contactPointSettingsSchema.safeParse({ type: 'discord', webhookUrl: 'aGVsbG8=' }).success).toBe(true);
  });
});
