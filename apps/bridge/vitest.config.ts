import type { D1Migration } from '@cloudflare/vitest-pool-workers';

import fs from 'node:fs';
import path from 'node:path';

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { configDefaults, defineConfig, defineProject } from 'vitest/config';
import { unstable_splitSqlQuery } from 'wrangler';

// drizzle-kit v1 emits per-migration folders (<timestamp>_<name>/migration.sql),
// but the pool's readD1Migrations only reads flat *.sql files. Read the nested
// layout ourselves: the fixed-width timestamp prefix makes a lexical sort
// chronological, and unstable_splitSqlQuery is what readD1Migrations uses.
const readNestedD1Migrations = (migrationsPath: string): D1Migration[] =>
  fs
    .readdirSync(migrationsPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .map(name => ({
      name,
      queries: unstable_splitSqlQuery(fs.readFileSync(path.join(migrationsPath, name, 'migration.sql'), 'utf8')),
    }));

export default defineConfig(() => {
  const migrations = readNestedD1Migrations(path.join(__dirname, 'drizzle'));

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
      // vitest 4's default exclude is only node_modules + .git, so gitignored build-output
      // dirs (which can hold stale compiled *.test.js from a prior build) must be excluded
      // explicitly — otherwise vitest discovers and double-counts them.
      exclude: [...configDefaults.exclude, '**/dist/**', '**/.output/**', '**/.vinxi/**', '**/.wrangler/**'],
    },
  });
});
