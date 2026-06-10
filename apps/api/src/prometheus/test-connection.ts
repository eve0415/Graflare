import type { PrometheusAuth } from './client';

import { authHeaders } from './auth';

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

// Probe `<base>/api/v1/labels?limit=1` — the cheapest authenticated Prometheus
// endpoint — and report reachability + latency. Shared by the RPC and HTTP
// test-connection paths so they cannot drift.
export const testPrometheusEndpoint = async (baseUrl: string, auth: PrometheusAuth, timeoutMs: number): Promise<TestConnectionResult> => {
  const start = Date.now();
  try {
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v1/labels`;
    url.searchParams.set('limit', '1');

    const res = await fetch(url.toString(), {
      headers: authHeaders(auth),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { success: false, latencyMs, error: `Upstream returned ${String(res.status)}` };
    }
    return { success: true, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : 'Connection failed';
    return { success: false, latencyMs, error: message };
  }
};
