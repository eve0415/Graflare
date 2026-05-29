---
paths:
  - '**/tsconfig.json'
---

# TypeScript config layout (this monorepo)

tsconfigs are **noEmit, non-composite, solution-style**. oxlint's type-aware mode
(`oxlint-tsgolint`) is the type-check gate — there is no `tsgo --build`. Layout:

- **Root `tsconfig.json`**: the shared strict base `compilerOptions` + `files: []` +
  `references` to each package.
- **Per-package `tsconfig.json`**: a solution file — `files: []` + `references` to the leaf
  configs that exist (`./tsconfig.src.json`, `./tsconfig.node.json`, `./tsconfig.test.json`).
- **Leaf configs** `extends` the root base and differ only by `lib`/`types`/`jsx`/`include`/
  `files`: `src` (app/lib source + `worker-configuration.d.ts`, excludes tests), `node`
  (`types: ["node"]`, `files: [vite/vitest/drizzle.config.ts]`), `test` (`*.test.*` +
  `test-setup.ts`, test-runtime `types`).

Rules when editing:

- **Never add `composite`/`declaration`/`emitDeclarationOnly`/`outDir`/`rootDir`.** Nothing emits;
  packages are source-only (their `exports` point at `./src/*`).
- Type-aware oxlint resolves a file through the nearest solution `tsconfig.json` by following its
  `references` into the leaf that includes the file — so every source/test/config file must live
  in exactly one leaf's `include`/`files` (config files in `node`, tests in `test`, rest in
  `src`).
- Put `worker-configuration.d.ts` in a leaf's `include` (not `types`); regenerate it with
  `pnpm generate`.
- A source-only package shipping `.tsx` needs `@types/react` + `@types/react-dom` in its `src`
  leaf `types`; the `node` leaf needs `@types/node` (a devDep of each app that has config files).

Tooling: `tsgo` is `@typescript/native-preview` (TS native port). Kept for the editor and a
manual `tsgo --noEmit -p <leaf>` fallback, but it is not a CI gate. Never add `typescript`/`tsc`.
