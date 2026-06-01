---
paths:
  - 'apps/web/**/*.test.tsx'
  - 'apps/web/tests/setup.ts'
---

# apps/web tests (jsdom vitest)

- Routes load **lazily** — `await router.load()` before asserting, or the body renders empty.
- Server-fn modules (`routes/**/-api.ts`, `lib/proxy.ts`) import `cloudflare:workers`, which
  has no implementation under jsdom — so they are mocked in `tests/setup.ts` with
  contract-accurate return shapes. Keep those shapes in sync with the real exports (loaders
  rely on them, e.g. `listDatasources` → `[]`, `getDatasource` → `null`).
- shadcn `CardTitle` renders a `<div>`, not a heading — query by text/label, not
  `role: "heading"`.
