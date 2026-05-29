---
paths:
  - 'apps/web/**/*.test.tsx'
  - 'apps/web/src/test-setup.ts'
---

# apps/web tests (jsdom vitest)

- Routes load **lazily** — `await router.load()` before asserting, or the body renders empty.
- `src/lib/api.ts` (the server-fn bridge) imports `cloudflare:workers`, which has no
  implementation under jsdom — so the whole module is mocked in `src/test-setup.ts`
  (`vi.mock('./lib/api', …)`) with contract-accurate return shapes. Keep those shapes in sync
  with the real exports (loaders rely on them, e.g. `listDatasources` → `[]`, `getDatasource`
  → `null`).
- shadcn `CardTitle` renders a `<div>`, not a heading — query by text/label, not
  `role: "heading"`.
