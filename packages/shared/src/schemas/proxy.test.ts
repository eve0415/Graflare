import { describe, expect, it } from 'vitest';

import { datasourceIdParamSchema, instantQueryBodySchema, labelNameParamSchema, labelsQuerySchema, proxyQueryInputSchema, rangeQueryBodySchema } from './proxy';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('instantQueryBodySchema', () => {
  it('accepts a bare query', () => {
    expect(instantQueryBodySchema.safeParse({ query: 'up' }).success).toBe(true);
  });

  it('accepts query + time (RFC3339)', () => {
    expect(instantQueryBodySchema.safeParse({ query: 'up', time: '2026-05-29T00:00:00Z' }).success).toBe(true);
  });

  it('rejects a missing query', () => {
    expect(instantQueryBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty query', () => {
    expect(instantQueryBodySchema.safeParse({ query: '' }).success).toBe(false);
  });
});

describe('rangeQueryBodySchema', () => {
  const ok = { query: 'up', start: '1716854400', end: '1716858000', step: '15s' };

  it('accepts a full range query', () => {
    expect(rangeQueryBodySchema.safeParse(ok).success).toBe(true);
  });

  it('accepts scientific-notation and RFC3339 bounds', () => {
    expect(rangeQueryBodySchema.safeParse({ ...ok, start: '1.5e9', end: '2026-05-29T00:00:00Z' }).success).toBe(true);
  });

  it('rejects a missing start', () => {
    const { start: _start, ...rest } = ok;
    expect(rangeQueryBodySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty step', () => {
    expect(rangeQueryBodySchema.safeParse({ ...ok, step: '' }).success).toBe(false);
  });
});

describe('labelsQuerySchema', () => {
  it('accepts no match[]', () => {
    expect(labelsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a match[] array', () => {
    expect(labelsQuerySchema.safeParse({ 'match[]': ['up', 'rate(http_requests_total[5m])'] }).success).toBe(true);
  });
});

describe('datasourceIdParamSchema', () => {
  it('accepts a UUID id', () => {
    expect(datasourceIdParamSchema.safeParse({ id: UUID }).success).toBe(true);
  });

  it('rejects a malformed id', () => {
    expect(datasourceIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('labelNameParamSchema', () => {
  it('accepts id + name', () => {
    expect(labelNameParamSchema.safeParse({ id: UUID, name: '__name__' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(labelNameParamSchema.safeParse({ id: UUID, name: '' }).success).toBe(false);
  });
});

describe('proxyQueryInputSchema', () => {
  it('accepts a valid web proxy input', () => {
    expect(proxyQueryInputSchema.safeParse({ datasourceId: UUID, endpoint: '/api/v1/query', params: { query: 'up' } }).success).toBe(true);
  });

  it('rejects a bad datasourceId', () => {
    expect(proxyQueryInputSchema.safeParse({ datasourceId: 'nope', endpoint: '/api/v1/query', params: {} }).success).toBe(false);
  });
});
