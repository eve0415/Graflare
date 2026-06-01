---
paths:
  - 'apps/web/src/routes/**/-api.ts'
  - 'apps/web/src/lib/proxy.ts'
---

# Server functions / RPC bridge

Server functions are colocated with their feature routes:
- `routes/dashboards/-api.ts` — dashboard + folder CRUD
- `routes/datasources/-api.ts` — datasource CRUD + test connection
- `lib/proxy.ts` — `proxyQuery` (cross-feature, used by explore + panels + datasource test)

- The validator method is **`.inputValidator()`**, not `.validator()`.
- Reach Cloudflare bindings via `import { env } from 'cloudflare:workers'` — NOT off `context`.
  `env.API` is the typed RPC stub to the API Worker (`Service<GraflareAPI>`). The typing comes
  from generating `worker-configuration.d.ts` with both worker configs
  (`wrangler types -c wrangler.json -c ../api/wrangler.json`, wired into web's `generate` script)
  plus `"entrypoint": "GraflareAPI"` on the service binding in `wrangler.json`. So
  `env.API.method()` is fully typed — no casts, no `@ts-nocheck`.
- RPC return values are branded with `[Symbol.dispose]` (Disposable) and widen tuples, which
  `createServerFn`'s serialization check rejects. Return a plain object instead: re-`parse`
  through the zod schema (e.g. `prometheusResponseSchema.parse(result)`) or rebuild the object
  field by field — spreading does NOT drop the brand.
- In jsdom tests these modules are mocked wholesale in `tests/setup.ts` so the real
  `cloudflare:workers` import never loads. Keep the mock's return shapes contract-accurate.
