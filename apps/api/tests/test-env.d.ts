import type { D1Migration } from 'cloudflare:test';

// vitest-pool-workers injects test-only bindings (configured via miniflare in
// vitest.config.ts) into the same `Cloudflare.Env` that both `cloudflare:test`
// and `cloudflare:workers` resolve `env` to. Augment it so they are typed.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      // Maintainer-provisioned secrets in production (set via `wrangler secret put`),
      // mirrored as miniflare test bindings in vitest.config.ts so `...env` carries them.
      CF_API_TOKEN: string;
      CF_ACCOUNT_ID: string;
    }
  }
}
