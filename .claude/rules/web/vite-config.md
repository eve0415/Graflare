---
paths:
  - "apps/web/vite.config.ts"
  - "apps/web/wrangler.json"
---

# apps/web vite.config.ts — React Compiler wiring

`@vitejs/plugin-react` no longer bundles Babel, so React Compiler is wired separately via
`@rolldown/plugin-babel`. Plugin **order is load-bearing**. Note the import forms: `babel` is a
**default** import; `reactCompilerPreset` is a **named** export of `@vitejs/plugin-react`.

```ts
import { cloudflare } from "@cloudflare/vite-plugin"
import babel from "@rolldown/plugin-babel"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})
```

`wrangler.json` uses `"main": "@tanstack/react-start/server-entry"` (no custom entry file).
WebSearch before changing these plugins or versions — this shape isn't the common-knowledge one.
