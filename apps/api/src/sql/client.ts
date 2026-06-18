import type { DatasourceCredentials } from '@graflare/shared/schemas/datasource';
import type { SqlResponse } from '@graflare/shared/schemas/sql';

import { sqlResponseSchema } from '@graflare/shared/schemas/sql';

import { authHeaders } from '../prometheus/auth';

interface SqlAuth {
  type: 'none' | 'basic' | 'bearer';
  credentials?: DatasourceCredentials;
}

export class SqlClient {
  constructor(
    private baseUrl: string,
    private auth: SqlAuth,
    private timeoutMs: number,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async query(sql: string, params: (string | number)[]): Promise<SqlResponse> {
    const url = new URL(this.baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/sql`;

    const targetUrl = url.toString();

    try {
      const res = await this.fetchFn(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(this.auth),
        },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        return { columns: [], rows: [], error: `Upstream ${targetUrl} returned ${String(res.status)}` };
      }

      return sqlResponseSchema.parse(await res.json());
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    const result = await this.query('SELECT 1', []);
    const latencyMs = Date.now() - start;
    if (result.error !== undefined) {
      return { success: false, latencyMs, error: result.error };
    }
    return { success: true, latencyMs };
  }

  private errorResponse(error: unknown): SqlResponse {
    const message = error instanceof Error ? error.message : 'Request failed';
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      columns: [],
      rows: [],
      error: isTimeout ? `Query timed out after ${String(this.timeoutMs / 1000)}s` : message,
    };
  }
}
