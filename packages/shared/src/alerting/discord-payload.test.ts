import type { AlertForPayload } from './webhook-payload';

import { describe, expect, it } from 'vitest';

import { buildDiscordPayload } from './discord-payload';

const must = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error('expected defined');
  return v;
};

const firingAlert: AlertForPayload = {
  state: 'Firing',
  labels: { alertname: 'HighCPU', severity: 'critical', job: 'api' },
  annotations: { summary: 'CPU is high' },
  value: '95',
  activeAt: 1717200000000,
  fingerprint: 'abc123',
  generatorURL: 'http://localhost/alerting/rules/1',
};

const resolvedAlert: AlertForPayload = {
  state: 'Resolved',
  labels: { alertname: 'HighCPU', severity: 'critical', job: 'web' },
  annotations: { summary: 'CPU recovered' },
  value: '50',
  activeAt: 1717200000000,
  resolvedAt: 1717203600000,
  fingerprint: 'def456',
  generatorURL: 'http://localhost/alerting/rules/1',
};

describe('buildDiscordPayload', () => {
  it('uses the decimal red color for a firing alert', () => {
    const payload = buildDiscordPayload([firingAlert], 'team', 'http://localhost');
    expect(payload.content).toContain('FIRING');
    expect(must(payload.embeds[0]).color).toBe(0xd3_2f_2f);
  });

  it('uses the decimal green color for a resolved alert', () => {
    const payload = buildDiscordPayload([resolvedAlert], 'team', 'http://localhost');
    expect(payload.content).toContain('RESOLVED');
    expect(must(payload.embeds[0]).color).toBe(0x38_8e_3c);
  });

  it('mixed firing + resolved reports firing in the content', () => {
    const payload = buildDiscordPayload([firingAlert, resolvedAlert], 'team', 'http://localhost');
    expect(payload.content).toContain('FIRING');
    expect(payload.embeds).toHaveLength(2);
  });

  it('puts labels into embed fields with non-empty name/value', () => {
    const payload = buildDiscordPayload([firingAlert], 'team', 'http://localhost');
    const { fields } = must(payload.embeds[0]);
    expect(fields).toContainEqual({ name: 'severity', value: 'critical', inline: true });
    for (const f of fields) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.value.length).toBeGreaterThan(0);
    }
  });

  it('drops labels with an empty value (Discord rejects empty field sides)', () => {
    const withEmpty: AlertForPayload = { ...firingAlert, labels: { alertname: 'X', empty: '' } };
    const payload = buildDiscordPayload([withEmpty], 'team', 'http://localhost');
    const { fields } = must(payload.embeds[0]);
    expect(fields.some(f => f.name === 'empty')).toBe(false);
  });

  it('includes the alert value in the embed description', () => {
    const payload = buildDiscordPayload([firingAlert], 'team', 'http://localhost');
    expect(must(payload.embeds[0]).description).toContain('95');
  });

  it('omits username and avatar overrides when not provided', () => {
    const payload = buildDiscordPayload([firingAlert], 'team', 'http://localhost');
    expect(payload.username).toBeUndefined();
    expect(payload.avatar_url).toBeUndefined();
  });

  it('includes username and avatar overrides when provided', () => {
    const payload = buildDiscordPayload([firingAlert], 'team', 'http://localhost', { username: 'Graflare', avatarUrl: 'https://x/y.png' });
    expect(payload.username).toBe('Graflare');
    expect(payload.avatar_url).toBe('https://x/y.png');
  });

  it('ignores empty-string overrides', () => {
    const payload = buildDiscordPayload([firingAlert], 'team', 'http://localhost', { username: '', avatarUrl: '' });
    expect(payload.username).toBeUndefined();
    expect(payload.avatar_url).toBeUndefined();
  });

  it('caps content at 2000 characters', () => {
    const payload = buildDiscordPayload([firingAlert], 'x'.repeat(5000), 'http://localhost');
    expect(payload.content.length).toBeLessThanOrEqual(2000);
  });

  it('caps embeds at 10 and adds a summary for overflow', () => {
    const many: AlertForPayload[] = Array.from({ length: 25 }, (_, i) => ({ ...firingAlert, fingerprint: `f${i}` }));
    const payload = buildDiscordPayload(many, 'team', 'http://localhost');
    expect(payload.embeds.length).toBeLessThanOrEqual(10);
    expect(must(payload.embeds.at(-1)).title).toContain('more alerts');
  });

  it('handles empty alerts', () => {
    const payload = buildDiscordPayload([], 'team', 'http://localhost');
    expect(payload.content).toContain('RESOLVED');
    expect(payload.embeds).toHaveLength(0);
  });
});
