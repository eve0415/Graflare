import { describe, expect, it } from 'vitest';

import {
  createServiceTokenSchema,
  serviceTokenListSchema,
  serviceTokenSchema,
  serviceTokenWithSecretSchema,
} from './service-token';

describe('createServiceTokenSchema', () => {
  it('accepts a name with no duration', () => {
    const parsed = createServiceTokenSchema.parse({ name: 'ci-token' });
    expect(parsed.name).toBe('ci-token');
    expect(parsed.duration).toBeUndefined();
  });

  it('accepts a valid Go-style duration', () => {
    expect(createServiceTokenSchema.parse({ name: 't', duration: '8760h' }).duration).toBe('8760h');
    expect(createServiceTokenSchema.parse({ name: 't', duration: '2h45m' }).duration).toBe('2h45m');
    expect(createServiceTokenSchema.parse({ name: 't', duration: '300ms' }).duration).toBe('300ms');
  });

  it('rejects an empty name', () => {
    expect(() => createServiceTokenSchema.parse({ name: '' })).toThrow();
  });

  it('rejects an over-long name', () => {
    expect(() => createServiceTokenSchema.parse({ name: 'x'.repeat(256) })).toThrow();
  });

  it('rejects a malformed duration', () => {
    expect(() => createServiceTokenSchema.parse({ name: 't', duration: 'forever' })).toThrow();
    expect(() => createServiceTokenSchema.parse({ name: 't', duration: '10 days' })).toThrow();
  });
});

describe('serviceTokenWithSecretSchema (create response)', () => {
  const valid = {
    id: 'tok-id',
    client_id: 'client-abc',
    client_secret: 'super-secret',
    name: 'ci-token',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
    duration: '8760h',
  };

  it('parses a full create response including the secret', () => {
    const parsed = serviceTokenWithSecretSchema.parse(valid);
    expect(parsed.client_secret).toBe('super-secret');
    expect(parsed.client_id).toBe('client-abc');
  });

  it('parses when expires_at and duration are absent', () => {
    const { expires_at: _e, duration: _d, ...rest } = valid;
    const parsed = serviceTokenWithSecretSchema.parse(rest);
    expect(parsed.expires_at).toBeUndefined();
    expect(parsed.duration).toBeUndefined();
  });

  it('rejects a response missing the secret', () => {
    const { client_secret: _s, ...rest } = valid;
    expect(() => serviceTokenWithSecretSchema.parse(rest)).toThrow();
  });

  it('rejects an empty client_id', () => {
    expect(() => serviceTokenWithSecretSchema.parse({ ...valid, client_id: '' })).toThrow();
  });
});

describe('serviceTokenSchema / serviceTokenListSchema (list response)', () => {
  const item = {
    id: 'tok-id',
    client_id: 'client-abc',
    name: 'ci-token',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-01-01T00:00:00Z',
  };

  it('parses a list item without a secret', () => {
    const parsed = serviceTokenSchema.parse(item);
    expect(parsed.client_id).toBe('client-abc');
    expect('client_secret' in parsed).toBe(false);
  });

  it('strips an unexpected client_secret from list items (never surfaced)', () => {
    const parsed = serviceTokenSchema.parse({ ...item, client_secret: 'leaked' });
    expect('client_secret' in parsed).toBe(false);
  });

  it('parses an array of list items', () => {
    const parsed = serviceTokenListSchema.parse([item, { ...item, id: 'tok-2', client_id: 'client-def' }]);
    expect(parsed).toHaveLength(2);
  });
});
