# Graflare

Grafana-compatible dashboards + alerting that run natively on Cloudflare Workers and query the
user's **own** data sources. Graflare is the Grafana _app layer_ — dashboards, query proxy,
alerting, notifications — and stores **no metrics itself**.

The product spec (scope, Cloudflare-primitive mapping, alerting design, roadmap, and the
clean-room legal constraints — never fork or vendor Grafana source) is `.claude/specs.local.md`
(local, gitignored). Consult it for any non-trivial scope or architecture decision; if it's
missing, ask the maintainer rather than guessing scope.

## Architecture

Two Workers joined by a service binding: the web Worker (user-facing UI) calls the API Worker's
RPC methods directly, with no public HTTP hop. Both Workers are deployed publicly and guarded by
Cloudflare Access on their public routes; the web→API service-binding call is the internal
exception that bypasses Access. The data layer is Drizzle over D1. Shared zod schemas cross the
Worker↔browser boundary in `packages/shared`.

## Stack posture

Deliberately bleeding-edge (Hono; TanStack Start + React Compiler; shadcn on Base UI; oxlint;
`tsgo`; Zod). Several of these changed their APIs in ways that don't match common knowledge —
trust the working config over priors, and WebSearch before changing a version or a tool's
config. Exact pinned versions live in each `package.json`.

## Verify before "done"

Run these (root `package.json` scripts) and fix everything before claiming completion:
`pnpm lint:ci` (oxlint type-aware + oxfmt --check — non-mutating), `pnpm test` (vitest),
`pnpm build`. oxlint runs in type-aware/type-check mode (via `oxlint-tsgolint`), so it is the
type-check gate — there is no separate `tsgo` build step. `pnpm lint` is the dev variant: it
`--fix`es and runs oxfmt, so don't use it as the gate. For a manual type-check of one project,
`pnpm exec tsgo --noEmit -p <leaf tsconfig>` still works as a fallback.
