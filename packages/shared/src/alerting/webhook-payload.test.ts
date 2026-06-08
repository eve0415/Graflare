import type { AlertForPayload } from './webhook-payload';

import { describe, expect, it } from 'vitest';

import { buildWebhookPayload } from './webhook-payload';

const must = <T,>(v: T | undefined): T => {
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
  annotations: { summary: 'CPU is high' },
  value: '50',
  activeAt: 1717200000000,
  resolvedAt: 1717203600000,
  fingerprint: 'def456',
  generatorURL: 'http://localhost/alerting/rules/1',
};

describe('buildWebhookPayload', () => {
  it('builds firing payload', () => {
    const payload = buildWebhookPayload([firingAlert], 'default-receiver', 'http://localhost');
    expect(payload.status).toBe('firing');
    expect(payload.alerts).toHaveLength(1);
    expect(must(payload.alerts[0]).status).toBe('firing');
    expect(payload.receiver).toBe('default-receiver');
    expect(payload.externalURL).toBe('http://localhost');
  });

  it('builds resolved payload', () => {
    const payload = buildWebhookPayload([resolvedAlert], 'default-receiver', 'http://localhost');
    expect(payload.status).toBe('resolved');
    expect(must(payload.alerts[0]).endsAt).toBeTruthy();
  });

  it('mixed firing + resolved = firing status', () => {
    const payload = buildWebhookPayload([firingAlert, resolvedAlert], 'default-receiver', 'http://localhost');
    expect(payload.status).toBe('firing');
    expect(payload.alerts).toHaveLength(2);
  });

  it('computes commonLabels', () => {
    const payload = buildWebhookPayload([firingAlert, resolvedAlert], 'default-receiver', 'http://localhost');
    expect(payload.commonLabels).toEqual({ alertname: 'HighCPU', severity: 'critical' });
  });

  it('computes commonAnnotations', () => {
    const payload = buildWebhookPayload([firingAlert, resolvedAlert], 'default-receiver', 'http://localhost');
    expect(payload.commonAnnotations).toEqual({ summary: 'CPU is high' });
  });

  it('handles single alert', () => {
    const payload = buildWebhookPayload([firingAlert], 'r', 'http://x');
    expect(payload.commonLabels).toEqual(firingAlert.labels);
    expect(payload.groupLabels).toEqual(firingAlert.labels);
  });

  it('handles empty alerts', () => {
    const payload = buildWebhookPayload([], 'r', 'http://x');
    expect(payload.status).toBe('resolved');
    expect(payload.alerts).toHaveLength(0);
    expect(payload.commonLabels).toEqual({});
  });

  it('alert values contain numeric value', () => {
    const payload = buildWebhookPayload([firingAlert], 'r', 'http://x');
    expect(must(payload.alerts[0]).values).toEqual({ value: 95 });
  });

  it('fingerprint is preserved', () => {
    const payload = buildWebhookPayload([firingAlert], 'r', 'http://x');
    expect(must(payload.alerts[0]).fingerprint).toBe('abc123');
  });
});
