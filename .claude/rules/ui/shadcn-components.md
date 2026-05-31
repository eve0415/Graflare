---
paths:
  - 'packages/ui/components.json'
  - 'packages/ui/src/components/**'
  - 'apps/web/src/components/**'
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

## Base UI render prop — NOT asChild

This is Base UI (Rhea style), **not Radix**. Polymorphic rendering uses the `render` prop:

```tsx
// ✅ Correct — Base UI render prop
<SidebarMenuButton render={<Link to="/" />}>
  <Icon /> Label
</SidebarMenuButton>

// ❌ Wrong — Radix pattern, leaks `asChild` to the DOM
<SidebarMenuButton asChild>
  <Link to="/">...</Link>
</SidebarMenuButton>
```

**Exception: `Button` enforces `nativeButton`** — `render={<Link />}` triggers a warning
because `Link` is not a `<button>`. For navigation links styled as buttons, apply
`buttonVariants()` to the `Link` directly:

```tsx
import { buttonVariants } from '@graflare/ui/components/button';

<Link to="/new" className={buttonVariants()}>New Item</Link>
<Link to="/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>New Item</Link>
```
