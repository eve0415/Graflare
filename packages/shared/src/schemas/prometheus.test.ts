import { describe, expect, it } from 'vitest';

import { prometheusResponseSchema } from './prometheus';

describe('prometheusResponseSchema', () => {
  it('accepts success response with data', () => {
    const result = prometheusResponseSchema.safeParse({
      status: 'success',
      data: {
        resultType: 'vector',
        result: [{ metric: { __name__: 'up' }, value: [1716854400, '1'] }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a labels response (string array data)', () => {
    const result = prometheusResponseSchema.safeParse({
      status: 'success',
      data: ['__name__', 'job', 'instance'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a series response (label-set array data)', () => {
    const result = prometheusResponseSchema.safeParse({
      status: 'success',
      data: [{ __name__: 'up', job: 'api' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts error response', () => {
    const result = prometheusResponseSchema.safeParse({
      status: 'error',
      errorType: 'bad_data',
      error: 'invalid query',
    });
    expect(result.success).toBe(true);
  });

  it('accepts response with warnings', () => {
    const result = prometheusResponseSchema.safeParse({
      status: 'success',
      warnings: ['some warning'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = prometheusResponseSchema.safeParse({
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = prometheusResponseSchema.safeParse({
      warnings: ['some warning'],
    });
    expect(result.success).toBe(false);
  });
});
