import { describe, expect, it } from 'vitest';

import { createDatasourceSchema, datasourceSchema, testConnectionInlineSchema, updateDatasourceSchema } from './datasource';

const validDatasource = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  orgId: '660e8400-e29b-41d4-a716-446655440000',
  name: 'Production Prometheus',
  type: 'prometheus' as const,
  url: 'https://prometheus.example.com',
  authType: 'bearer' as const,
  queryTimeoutMs: 30000,
  createdAt: 1716854400000,
  updatedAt: 1716854400000,
};

describe('datasourceSchema', () => {
  it('accepts valid datasource', () => {
    const result = datasourceSchema.safeParse(validDatasource);
    expect(result.success).toBe(true);
  });

  it('applies default queryTimeoutMs', () => {
    const { queryTimeoutMs: _, ...without } = validDatasource;
    const parsed = datasourceSchema.parse(without);
    expect(parsed.queryTimeoutMs).toBe(30000);
  });

  it('rejects empty name', () => {
    const result = datasourceSchema.safeParse({ ...validDatasource, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 255 chars', () => {
    const result = datasourceSchema.safeParse({
      ...validDatasource,
      name: 'a'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = datasourceSchema.safeParse({
      ...validDatasource,
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for id', () => {
    const result = datasourceSchema.safeParse({
      ...validDatasource,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid auth type', () => {
    const result = datasourceSchema.safeParse({
      ...validDatasource,
      authType: 'oauth',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datasource type', () => {
    const result = datasourceSchema.safeParse({
      ...validDatasource,
      type: 'graphite',
    });
    expect(result.success).toBe(false);
  });

  it('rejects queryTimeoutMs below 1000', () => {
    const result = datasourceSchema.safeParse({
      ...validDatasource,
      queryTimeoutMs: 500,
    });
    expect(result.success).toBe(false);
  });

  it('rejects queryTimeoutMs above 120000', () => {
    const result = datasourceSchema.safeParse({
      ...validDatasource,
      queryTimeoutMs: 150000,
    });
    expect(result.success).toBe(false);
  });
});

describe('createDatasourceSchema', () => {
  it('accepts valid create input', () => {
    const result = createDatasourceSchema.safeParse({
      name: 'New Source',
      type: 'prometheus',
      url: 'https://prom.example.com',
      authType: 'basic',
      credentials: { username: 'admin', password: 'secret' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts create without credentials', () => {
    const result = createDatasourceSchema.safeParse({
      name: 'New Source',
      type: 'prometheus',
      url: 'https://prom.example.com',
      authType: 'none',
    });
    expect(result.success).toBe(true);
  });

  it('strips id when provided', () => {
    const parsed = createDatasourceSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'New Source',
      type: 'prometheus',
      url: 'https://prom.example.com',
      authType: 'none',
    });
    expect('id' in parsed).toBe(false);
  });

  it('accepts a SQL datasource with a dialect', () => {
    const result = createDatasourceSchema.safeParse({ name: 'D1', type: 'sql', dialect: 'sqlite', url: 'https://bridge.example.com', authType: 'none' });
    expect(result.success).toBe(true);
  });

  it('rejects a SQL datasource without a dialect', () => {
    const result = createDatasourceSchema.safeParse({ name: 'D1', type: 'sql', url: 'https://bridge.example.com', authType: 'none' });
    expect(result.success).toBe(false);
  });

  it('rejects a Prometheus datasource that carries a dialect', () => {
    const result = createDatasourceSchema.safeParse({ name: 'Prom', type: 'prometheus', dialect: 'sqlite', url: 'https://prom.example.com', authType: 'none' });
    expect(result.success).toBe(false);
  });
});

describe('updateDatasourceSchema', () => {
  it('accepts partial update', () => {
    const result = updateDatasourceSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty update', () => {
    const result = updateDatasourceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL in partial update', () => {
    const result = updateDatasourceSchema.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('testConnectionInlineSchema', () => {
  it('accepts valid prometheus input', () => {
    const result = testConnectionInlineSchema.safeParse({
      type: 'prometheus',
      url: 'https://prom.example.com',
      authType: 'bearer',
      credentials: { token: 'secret' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid sql input without credentials', () => {
    const result = testConnectionInlineSchema.safeParse({
      type: 'sql',
      url: 'https://bridge.example.com',
      authType: 'none',
    });
    expect(result.success).toBe(true);
  });

  it('applies default queryTimeoutMs', () => {
    const parsed = testConnectionInlineSchema.parse({
      type: 'prometheus',
      url: 'https://prom.example.com',
      authType: 'none',
    });
    expect(parsed.queryTimeoutMs).toBe(30000);
  });

  it('rejects invalid URL', () => {
    const result = testConnectionInlineSchema.safeParse({
      type: 'prometheus',
      url: 'not-a-url',
      authType: 'none',
    });
    expect(result.success).toBe(false);
  });
});
