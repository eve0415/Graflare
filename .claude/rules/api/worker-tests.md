---
paths:
  - 'apps/api/vitest.config.ts'
  - 'apps/api/**/*.test.ts'
  - 'apps/api/tests/setup.ts'
---

# API Worker tests — @cloudflare/vitest-pool-workers

The pool's API differs from what's commonly documented. `apps/api/vitest.config.ts` and
`apps/api/tests/setup.ts` are the canonical working examples — copy their shape.

- **Config**: use `cloudflareTest()` + `readD1Migrations()` imported from
  `@cloudflare/vitest-pool-workers`. Do **not** use the older `defineWorkersConfig` /
  `poolOptions.workers` shape.
- **Test files**: import `env` and `exports` from `cloudflare:workers` (not `cloudflare:test`).
  There is no `SELF` — fetch the worker via `exports.default.fetch(url)`.
- **D1 migrations**: `readD1Migrations("./drizzle")` in the config → injected as a
  `TEST_MIGRATIONS` miniflare binding → applied in `tests/setup.ts` via
  `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` (`applyD1Migrations` is imported from
  `cloudflare:test`). The setup runs once outside per-test isolation and only applies
  un-applied migrations.
- These test files are type-checked in the package's `tsconfig.test.json` leaf (which carries
  `@cloudflare/vitest-pool-workers` types). The test-only `TEST_MIGRATIONS` binding is typed by
  augmenting `Cloudflare.Env` in `tests/test-env.d.ts` (this pool version types both
  `cloudflare:test` and `cloudflare:workers` `env` as `Cloudflare.Env`, so a `ProvidedEnv`
  augmentation would be dead).
- Harmless noise: a client test fetches an unreachable host, so workerd prints
  `Network connection lost` / `connect(): Connection refused`. Tests still pass.
