import type { AlertForPayload } from './webhook-payload';

import { describe, expect, it } from 'vitest';

import { buildSlackPayload } from './slack-payload';

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

describe('buildSlackPayload', () => {
  it('uses red color for a firing alert', () => {
    const payload = buildSlackPayload([firingAlert], 'team', 'http://localhost');
    expect(payload.text).toContain('FIRING');
    expect(must(payload.attachments[0]).color).toBe('#D32F2F');
  });

  it('uses green color for a resolved alert', () => {
    const payload = buildSlackPayload([resolvedAlert], 'team', 'http://localhost');
    expect(payload.text).toContain('RESOLVED');
    expect(must(payload.attachments[0]).color).toBe('#388E3C');
  });

  it('mixed firing + resolved reports firing in the summary text', () => {
    const payload = buildSlackPayload([firingAlert, resolvedAlert], 'team', 'http://localhost');
    expect(payload.text).toContain('FIRING');
    expect(payload.text).toContain('1 firing');
    expect(payload.text).toContain('1 resolved');
    expect(payload.attachments).toHaveLength(2);
  });

  it('puts labels into attachment fields', () => {
    const payload = buildSlackPayload([firingAlert], 'team', 'http://localhost');
    const { fields } = must(payload.attachments[0]);
    expect(fields).toContainEqual({ title: 'severity', value: 'critical', short: true });
    expect(fields).toContainEqual({ title: 'alertname', value: 'HighCPU', short: true });
  });

  it('includes the alert value in the attachment text', () => {
    const payload = buildSlackPayload([firingAlert], 'team', 'http://localhost');
    expect(must(payload.attachments[0]).text).toContain('95');
  });

  it('omits channel and username overrides when not provided', () => {
    const payload = buildSlackPayload([firingAlert], 'team', 'http://localhost');
    expect(payload.channel).toBeUndefined();
    expect(payload.username).toBeUndefined();
  });

  it('includes channel and username overrides when provided', () => {
    const payload = buildSlackPayload([firingAlert], 'team', 'http://localhost', { channel: '#alerts', username: 'Graflare' });
    expect(payload.channel).toBe('#alerts');
    expect(payload.username).toBe('Graflare');
  });

  it('ignores empty-string overrides', () => {
    const payload = buildSlackPayload([firingAlert], 'team', 'http://localhost', { channel: '', username: '' });
    expect(payload.channel).toBeUndefined();
    expect(payload.username).toBeUndefined();
  });

  it('handles empty alerts', () => {
    const payload = buildSlackPayload([], 'team', 'http://localhost');
    expect(payload.text).toContain('RESOLVED');
    expect(payload.attachments).toHaveLength(0);
  });

  it('caps attachments and adds a summary for overflow', () => {
    const many: AlertForPayload[] = Array.from({ length: 25 }, (_, i) => ({ ...firingAlert, fingerprint: `f${i}` }));
    const payload = buildSlackPayload(many, 'team', 'http://localhost');
    expect(payload.attachments.length).toBeLessThanOrEqual(21);
    expect(must(payload.attachments.at(-1)).title).toContain('more alerts');
  });
});
