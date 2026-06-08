import type { BridgeEnv } from '../env';

import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { billingCollector } from './billing';

const testEnv: BridgeEnv = {
  DB: env.DB,
  CF_API_TOKEN: env.CF_API_TOKEN,
  CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
  CF_ZONE_IDS: '',
  BRIDGE_AUTH_TOKEN: 'test-token',
};

describe('billing collector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct metadata', () => {
    expect(billingCollector.kind).toBe('rest');
    expect(billingCollector.name).toBe('billing');
    expect(billingCollector.scope).toBe('account');
    expect(billingCollector.minIntervalSeconds).toBe(3600);
  });

  it('parses valid billing response', async () => {
    const mockResponse = {
      success: true,
      result: [
        {
          serviceName: 'workers',
          billingCurrency: 'USD',
          consumedQuantity: 1000000,
          contractedCost: 5,
        },
        {
          serviceName: 'd1',
          billingCurrency: 'USD',
          consumedQuantity: 500000,
          contractedCost: 0.75,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const rows = await billingCollector.run(testEnv, '2026-06-05T00:00:00Z', '2026-06-05T12:00:00Z');

    expect(rows).toHaveLength(4);

    expect(rows).toContainEqual(
      expect.objectContaining({
        resource: 'workers',
        metricName: 'consumedQuantity',
        value: 1000000,
        dataset: 'billing',
      }),
    );

    expect(rows).toContainEqual(
      expect.objectContaining({
        resource: 'workers',
        metricName: 'contractedCost',
        value: 5,
      }),
    );

    expect(rows).toContainEqual(
      expect.objectContaining({
        resource: 'd1',
        metricName: 'contractedCost',
        value: 0.75,
      }),
    );
  });

  it('throws on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    await expect(billingCollector.run(testEnv, '2026-06-05T00:00:00Z', '2026-06-05T12:00:00Z')).rejects.toThrow('Billing API returned 403');
  });

  it('returns empty for missing result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const rows = await billingCollector.run(testEnv, '2026-06-05T00:00:00Z', '2026-06-05T12:00:00Z');
    expect(rows).toEqual([]);
  });

  it('skips items with invalid shape', async () => {
    const mockResponse = {
      result: [{ serviceName: 'workers', billingCurrency: 'USD', consumedQuantity: 100, contractedCost: 1 }, { invalid: true }],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const rows = await billingCollector.run(testEnv, '2026-06-05T00:00:00Z', '2026-06-05T12:00:00Z');
    expect(rows).toHaveLength(2);
  });
});
