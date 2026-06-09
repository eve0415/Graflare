import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { configDefaults, defineConfig, defineProject } from 'vitest/config';

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
            // Maintainer-provisioned secrets in prod (set via `wrangler secret put`);
            // mirrored here as test bindings so the service-token client/ops can run.
            CF_API_TOKEN: 'test-cf-token',
            CF_ACCOUNT_ID: 'test-account-id',
          },
          d1Databases: { DB: 'test-db' },
          workers: [
            {
              name: 'graflare-bridge',
              modules: true,
              script: 'export default { fetch() { return Response.json({ columns: [], rows: [] }); } }',
            },
          ],
        },
      }),
    ],
    test: {
      setupFiles: ['./tests/setup.ts'],
      // vitest 4's default exclude is only node_modules + .git, so gitignored build-output
      // dirs (which can hold stale compiled *.test.js from a prior build) must be excluded
      // explicitly — otherwise vitest discovers and double-counts them.
      exclude: [...configDefaults.exclude, '**/dist/**', '**/.output/**', '**/.vinxi/**', '**/.wrangler/**'],
    },
  });
});
