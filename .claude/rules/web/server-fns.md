---
paths:
  - "apps/web/src/lib/api.ts"
---

# Server functions / RPC bridge (apps/web/src/lib/api.ts)

This file bridges TanStack `createServerFn` handlers to the API Worker over the service binding.

- The validator method is **`.inputValidator()`**, not `.validator()`.
- Cloudflare bindings are reached in the handler via the Cloudflare env on `context`
  (`context.cloudflare.env.API` → the service-binding RPC stub to the API Worker).
- This file carries `// @ts-nocheck` on purpose: `createServerFn` return types are strictly
  serialization-checked, and the binding's RPC return types can't be statically proven
  serializable. Keep it here; all other web files stay type-checked.
- It is mocked in tests (see `src/test-setup.ts`).
