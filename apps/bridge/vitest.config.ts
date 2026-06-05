import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig, defineProject } from 'vitest/config';

export default defineConfig(async () => {
	const migrationsPath = path.join(__dirname, 'drizzle');
	const migrations = await readD1Migrations(migrationsPath);

	return defineProject({
		plugins: [
			cloudflareTest({
				wrangler: { configPath: './wrangler.json' },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						BRIDGE_AUTH_TOKEN: 'test-token',
						CF_API_TOKEN: 'test-cf-token',
						CF_ACCOUNT_ID: 'test-account-id',
						CF_ZONE_IDS: '',
						BRIDGE_DEBUG: '',
					},
					d1Databases: { DB: 'test-db' },
				},
			}),
		],
		test: {
			setupFiles: ['./tests/setup.ts'],
		},
	});
});
