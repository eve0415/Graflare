---
paths:
  - 'apps/api/vitest.config.ts'
  - 'apps/api/**/*.test.ts'
  - 'apps/api/tests/setup.ts'
  - 'apps/bridge/vitest.config.ts'
---

# API Worker tests — @cloudflare/vitest-pool-workers

The pool's API differs from what's commonly documented. `apps/api/vitest.config.ts` and
`apps/api/tests/setup.ts` are the canonical working examples — copy their shape
(`apps/bridge/vitest.config.ts` mirrors the config).

- **Config**: use `cloudflareTest()` from `@cloudflare/vitest-pool-workers`. Do **not** use the
  older `defineWorkersConfig` / `poolOptions.workers` shape. Do **not** use the pool's
  `readD1Migrations()`: it reads only flat `*.sql` files, and drizzle-kit v1 emits
  per-migration folders, so it silently returns `[]` and every DB test fails on missing tables.
- **Test files**: import `env` and `exports` from `cloudflare:workers` (not `cloudflare:test`).
  There is no `SELF` — fetch the worker via `exports.default.fetch(url)`.
- **D1 migrations**: each vitest.config.ts defines a local `readNestedD1Migrations()` that
  lists the `drizzle/<timestamp>_<name>/` folders (lexical sort = chronological) and splits
  each `migration.sql` via `unstable_splitSqlQuery` from `wrangler` → injected as a
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
