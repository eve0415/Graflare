import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

const sqlReq = (sql: string, params: (string | number | null)[] = []) =>
  req('/sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.BRIDGE_AUTH_TOKEN}`,
    },
    body: JSON.stringify({ sql, params }),
  });

describe('health check', () => {
  it('returns ok', async () => {
    const response = await exports.default.fetch(req('/health'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('sql endpoint', () => {
  it('returns 401 without auth', async () => {
    const response = await exports.default.fetch(
      req('/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT 1' }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const response = await exports.default.fetch(
      req('/sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-token',
        },
        body: JSON.stringify({ sql: 'SELECT 1' }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('executes valid select query', async () => {
    const response = await exports.default.fetch(sqlReq('SELECT 1 AS value'));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      columns: [{ name: 'value' }],
      rows: [[1]],
    });
  });

  it('executes select with bind params', async () => {
    const response = await exports.default.fetch(sqlReq('SELECT ? AS value', [42]));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      rows: [[42]],
    });
  });

  it('rejects insert queries', async () => {
    const response = await exports.default.fetch(
      sqlReq("INSERT INTO metrics (ts, dataset, resource, metric_name, value, dims) VALUES (1, 'x', 'y', 'z', 0, '{}')"),
    );
    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: 'Only SELECT queries are allowed' });
  });

  it('rejects update queries', async () => {
    const response = await exports.default.fetch(sqlReq('UPDATE metrics SET value = 0'));
    expect(response.status).toBe(403);
  });

  it('rejects delete queries', async () => {
    const response = await exports.default.fetch(sqlReq('DELETE FROM metrics'));
    expect(response.status).toBe(403);
  });

  it('rejects drop queries', async () => {
    const response = await exports.default.fetch(sqlReq('DROP TABLE metrics'));
    expect(response.status).toBe(403);
  });

  it('rejects multi-statement queries', async () => {
    const response = await exports.default.fetch(sqlReq('SELECT 1; DROP TABLE metrics'));
    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: 'Multi-statement queries are not allowed' });
  });

  it('returns 400 for empty sql', async () => {
    const response = await exports.default.fetch(sqlReq(''));
    expect(response.status).toBe(400);
  });

  it('returns empty result for empty metrics table', async () => {
    const response = await exports.default.fetch(sqlReq('SELECT ts, dataset, resource, metric_name, value FROM metrics LIMIT 1'));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ columns: [], rows: [] });
  });
});
