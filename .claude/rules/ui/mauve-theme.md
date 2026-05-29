---
paths:
  - 'packages/ui/src/globals.css'
---

# Mauve theme values (packages/ui/src/globals.css)

This file holds the full Mauve light + dark OKLCH variables. They were lifted from shadcn's
registry, **not** produced by the CLI — don't guess OKLCH values. To regenerate or extend them,
fetch from the registry:

```
gh api repos/shadcn-ui/ui/contents/apps/v4/registry/themes.ts --jq '.content' | base64 -d
# the "mauve" entry holds cssVars.light / cssVars.dark
```
