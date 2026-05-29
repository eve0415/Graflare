---
paths:
  - "apps/api/src/db/**"
  - "apps/api/drizzle.config.ts"
  - "apps/api/drizzle/**"
---

# D1 / Drizzle migrations (apps/api)

Schema lives in `apps/api/src/db/schema.ts`. **Never hand-write migration SQL** — generate it
from the schema, and treat `apps/api/drizzle/` as generated output (don't edit by hand).

```
pnpm --filter graflare-api exec drizzle-kit generate                          # writes drizzle/NNNN_*.sql
pnpm --filter graflare-api exec wrangler d1 migrations apply graflare --local # apply locally (--remote for prod)
```

`pnpm --filter graflare-api generate` runs `wrangler types && drizzle-kit generate` together.
Regenerate migrations after any schema change.
