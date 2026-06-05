import type { SqlResponse } from '@graflare/shared/schemas/sql';

import { Hono } from 'hono';

import { collectMetrics } from './cron';
import type { BridgeEnv } from './env';

const app = new Hono<{ Bindings: BridgeEnv }>();

app.get('/health', (c) => c.json({ status: 'ok' }));

const SELECT_RE = /^\s*SELECT\b/i;
const MULTI_STATEMENT_RE = /;\s*\S/;

interface SqlRequestBody {
	sql: string;
	params?: (string | number | null)[];
}

const isSqlRequestBody = (body: unknown): body is SqlRequestBody =>
	typeof body === 'object'
	&& body !== null
	&& 'sql' in body
	&& typeof body.sql === 'string';

app.post('/sql', async (c) => {
	const authHeader = c.req.header('Authorization');
	if (authHeader === undefined || authHeader !== `Bearer ${c.env.BRIDGE_AUTH_TOKEN}`) {
		return c.json({ columns: [], rows: [], error: 'Unauthorized' } satisfies SqlResponse, 401);
	}

	const raw: unknown = await c.req.json();
	if (!isSqlRequestBody(raw)) {
		return c.json({ columns: [], rows: [], error: 'Invalid request body' } satisfies SqlResponse, 400);
	}

	const { sql, params } = raw;

	if (sql.trim().length === 0) {
		return c.json({ columns: [], rows: [], error: 'SQL query is required' } satisfies SqlResponse, 400);
	}

	if (!SELECT_RE.test(sql)) {
		return c.json({ columns: [], rows: [], error: 'Only SELECT queries are allowed' } satisfies SqlResponse, 403);
	}

	if (MULTI_STATEMENT_RE.test(sql)) {
		return c.json({ columns: [], rows: [], error: 'Multi-statement queries are not allowed' } satisfies SqlResponse, 403);
	}

	const bindParams = Array.isArray(params) ? params : [];

	try {
		const stmt = c.env.DB.prepare(sql).bind(...bindParams);
		const result = await stmt.all();

		const columnNames = result.results.length > 0
			? Object.keys(result.results[0] ?? {})
			: [];

		const columns = columnNames.map((name) => ({ name }));
		const rows = result.results.map((row) =>
			columnNames.map((col) => {
				const v = row[col];
				if (v === null || v === undefined) return null;
				if (typeof v === 'number') return v;
				if (typeof v === 'string') return v;
				return JSON.stringify(v);
			}),
		);

		return c.json({ columns, rows } satisfies SqlResponse);
	} catch {
		return c.json({ columns: [], rows: [], error: 'Query execution failed' } satisfies SqlResponse, 500);
	}
});

export default {
	fetch: app.fetch,
	async scheduled(event: ScheduledEvent, env: BridgeEnv) {
		try {
			await collectMetrics(env, event.scheduledTime);
		} catch (error: unknown) {
			console.error(JSON.stringify({
				level: 'error',
				event: 'cron_fatal',
				error: error instanceof Error ? error.message : String(error),
			}));
		}
	},
};
