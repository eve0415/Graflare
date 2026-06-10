---
paths:
  - 'apps/api/src/db/**'
  - 'apps/api/drizzle.config.ts'
  - 'apps/api/drizzle/**'
  - 'apps/api/drizzle-do.config.ts'
  - 'apps/api/drizzle-do/**'
---

# D1 / Drizzle migrations (apps/api)

Schema lives in `apps/api/src/db/schema.ts`. **Never hand-write migration SQL** — generate it
from the schema, and treat `apps/api/drizzle/` as generated output (don't edit by hand).

```
pnpm --filter graflare-api exec drizzle-kit generate                          # writes drizzle/<timestamp>_<name>/{migration.sql,snapshot.json}
pnpm --filter graflare-api exec wrangler d1 migrations apply graflare --local # apply locally (--remote for prod)
```

`pnpm --filter graflare-api generate` runs `wrangler types && drizzle-kit generate && pnpm
generate:do` together. Regenerate migrations after any schema change.

- wrangler discovers the nested folders-v3 layout via `migrations_pattern:
  "drizzle/*/migration.sql"` in `wrangler.json`, and records applied names **relative to
  `migrations_dir`** (e.g. `<folder>/migration.sql`) in the `d1_migrations` table — renaming
  or moving a migration folder desyncs that bookkeeping and makes wrangler re-apply everything.
- The Durable Object schema (`src/alerting/do-schema.ts`) has its own config:
  `pnpm --filter graflare-api exec drizzle-kit generate --config=drizzle-do.config.ts`
  (the `generate:do` script), which emits `drizzle-do/<timestamp>_<name>/` AND regenerates the
  `drizzle-do/migrations.js` bundle the DO's sync migrator consumes — commit both together.
