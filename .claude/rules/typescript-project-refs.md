---
paths:
  - "**/tsconfig.json"
---

# TypeScript project references + tsgo (this monorepo)

`pnpm check` runs `tsgo --build` from the root `tsconfig.json`, which walks project references
into every package. One broken composite config fails the whole build. Apply these before
editing any `tsconfig.json` here:

- **`noEmit: true` conflicts with `composite: true`.** Composite projects must emit. Use
  `"emitDeclarationOnly": true` instead of `noEmit` for packages that are reference targets.

- **Don't put `*.config.ts` in `include` when `rootDir: "src"`.** Files like `vite.config.ts` /
  `vitest.config.ts` / `drizzle.config.ts` live at the package root, outside `src`, and trigger
  `TS6059: not under rootDir`. Leave `include: ["src"]` and let the bundler handle config files.

- **Exclude test files that import Workers-only modules.** Anything importing `cloudflare:workers`
  or `cloudflare:test` (api test files, `test-setup.ts`) only resolves inside the
  vitest-pool-workers runtime — `exclude` them from the tsgo build, or `pnpm check` fails on
  unresolved modules.

- **Source-only packages need their own ambient types.** A package that ships `.tsx` with no app
  context during `tsgo --build` must list `@types/react` + `@types/react-dom` in its `tsconfig`
  `types` array; otherwise JSX errors (`JSX.IntrinsicElements`, `react/jsx-runtime`).

- **Leaf apps need not be reference targets.** A leaf app can be composite + `emitDeclarationOnly`
  while nothing imports its emitted types; keep its `tsconfig` self-contained and exclude
  tests/config so the root build stays green.

Tooling: `tsgo` is `@typescript/native-preview` (TS native port). Never add `typescript`/`tsc`
alongside it. Linting is oxlint (+ `oxlint-tsgolint`); see the global typescript-tooling rule
for tool selection.
