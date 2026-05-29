import type { D1Migration } from "cloudflare:test"

// vitest-pool-workers exposes test-only bindings (configured via miniflare in
// vitest.config.ts) through `cloudflare:test`'s `env`. Augment ProvidedEnv so
// they are typed alongside the worker's real bindings.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}
