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
          bindings: { TEST_MIGRATIONS: migrations },
          d1Databases: { DB: 'test-db' },
        },
      }),
    ],
    test: {
      setupFiles: ['./src/test-setup.ts'],
    },
  });
});
