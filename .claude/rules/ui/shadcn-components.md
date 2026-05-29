---
paths:
  - "packages/ui/components.json"
  - "packages/ui/src/components/**"
---

# Adding shadcn components (packages/ui)

`components.json` is already configured (`style: base-rhea`, `baseColor: mauve`, Base UI,
aliases → `@graflare/ui/*`). To add a component:

```
cd packages/ui && npx shadcn@<version> add <name> --yes
```

- **Do not run `shadcn init` here.** Interactive `init` (and `init --base base --preset rhea`)
  fails with "could not detect a supported framework" — this is a source-only package with no
  app framework. The config already exists; just `add`.
- `components.json` must keep a `hooks` alias even though it's unused, or `shadcn add` errors
  "Could not resolve the following aliases: hooks".
