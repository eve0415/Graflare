import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

import { resetOrgBootstrapCache } from '../src/middleware/org';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Isolated storage gives every test a fresh D1 while module state persists, so
// the org bootstrap cache must reset per test or the org row is never re-created.
beforeEach(() => {
  resetOrgBootstrapCache();
});
