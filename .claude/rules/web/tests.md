---
paths:
  - "apps/web/**/*.test.tsx"
  - "apps/web/src/test-setup.ts"
---

# apps/web tests (jsdom vitest)

- Routes load **lazily** — `await router.load()` before asserting, or the body renders empty.
- `createServerFn` has no `.handler` / `.inputValidator` chain outside the build, so it's mocked
  in `src/test-setup.ts`. Keep the mock in sync if you start using a new builder method.
- shadcn `CardTitle` renders a `<div>`, not a heading — query by text/label, not
  `role: "heading"`.
