import type { D1Migration } from "cloudflare:test"

// vitest-pool-workers injects test-only bindings (configured via miniflare in
// vitest.config.ts) into the same `Cloudflare.Env` that both `cloudflare:test`
// and `cloudflare:workers` resolve `env` to. Augment it so they are typed.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
