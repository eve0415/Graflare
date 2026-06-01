---
name: tanstack-guide
description: >-
  Use when writing, reviewing, or debugging code that touches TanStack Router,
  Start, Query, Table, or Virtual in apps/web. Enforces TanStack Intent as the
  source of truth for Router/Start API patterns and documents Graflare-specific
  query and mutation conventions not covered by individual rule files.
---

# TanStack Guide — Graflare

## Intent as source of truth (Router & Start only)

`@tanstack/intent` is installed as a root devDependency. It ships versioned Agent Skills that
match the exact TanStack Router/Start packages in `node_modules`. **Intent skills — not training
data — own the API shapes for Router and Start.**

> Intent does NOT cover React Query, React Table, or React Virtual. For those
> libraries, use the Graflare conventions below, official docs, and existing code.

### Commands

```bash
pnpm intent list                              # discover available skills
pnpm intent load <package>#<skill>            # load a specific skill
```

**Always use `pnpm intent …` (the locally-installed binary).** The `pnpm dlx …` form that
`intent list` prints in its output bypasses the pinned version — ignore it.

### When to load a skill

- Before writing or modifying **any** Router/Start code (routes, loaders, navigation, server
  functions, middleware, SSR, code splitting, search params, auth guards)
- Before reviewing Router/Start code for correctness
- When a Router/Start API behaves unexpectedly

### When to skip

- Pure React Query / Table / Virtual work with no Router/Start interaction
- Changes that only touch rule-file territory (see "Covered elsewhere" below)
- Trivial edits where the API shape is already visible in the diff context

## Workflow

This workflow targets **Router/Start** concerns — the libraries Intent covers. For **React
Query / Table / Virtual** work, skip to the "Graflare conventions" section directly (Intent has
no skills for those libraries). Router APIs that appear in the conventions (e.g.
`router.invalidate()`) are stable enough to use as-is — no Intent load needed for one-liners
already shown in examples below.

1. **Identify the concern** — routing? server functions? data loading? navigation? If the
   concern is **React Query / Table / Virtual only**, skip to "Graflare conventions" below — the
   remaining steps are Router/Start-specific.
2. **`pnpm intent list`** — scan the skill tree for matching skills
3. **Match** — pick the skill whose description fits (e.g. `router-core/data-loading`,
   `start-core/server-functions`, `router-core/navigation`)
4. **`pnpm intent load <ref>`** — read the skill, apply its patterns
5. **Layer Graflare conventions** — after loading the Intent skill, apply the project-specific
   conventions from the table below (Intent tells you the API; the table tells you where
   Graflare puts things)
6. **Load multiple** — complex changes often span skills (e.g. a new route needs
   `router-core/data-loading` + `start-core/server-functions`); load each

## Covered elsewhere — do NOT duplicate

| Topic | Rule file | What it covers |
|-------|-----------|----------------|
| Route generation | `.claude/rules/web/routing.md` | `routeTree.gen.ts` is generated (no standalone CLI), layout route `<Outlet/>` rule |
| Server function gotchas | `.claude/rules/web/server-fns.md` | `.inputValidator()` not `.validator()`, `cloudflare:workers` env, RPC return branding, test mocking |
| Vite plugin wiring | `.claude/rules/web/vite-config.md` | Plugin order, React Compiler via `@rolldown/plugin-babel`, import forms |
| Test setup | `.claude/rules/web/tests.md` | Lazy route loading, `vi.mock` for `api.ts`, `CardTitle` renders `<div>` |

## Graflare conventions

These are project patterns not covered by Intent or any rule file.

### File organization

| Concern | Location |
|---------|----------|
| Server functions (RPC bridge) | `apps/web/src/lib/api.ts` — single file, all server fns |
| Query option factories | `apps/web/src/lib/query-options.ts` — all `queryOptions()` calls |
| Custom hooks | `apps/web/src/hooks/` (e.g. `use-variables.ts`) |
| Panel data hook | `apps/web/src/components/panels/use-panel-data.ts` |

### Query options factory pattern

Every data-fetching need gets a `queryOptions()` factory in `query-options.ts`:

```ts
export const dashboardQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard({ data: id }),
  });
```

### Canonical loader → component flow

```ts
// In route file — loader
loader: ({ params, context }) =>
  context.queryClient.ensureQueryData(dashboardQueryOptions(params.id)),

// In route component — read
const { data } = useSuspenseQuery(dashboardQueryOptions(id));
```

Same factory, same key. `ensureQueryData` in the loader, `useSuspenseQuery` in the component.

### Mutations

Direct server function call + cache invalidation. No `useMutation` wrapper:

```ts
const handleSave = useCallback(async () => {
  setSaving(true);
  await updateDashboard({ data: { id, data: formState } });
  await queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
  setSaving(false);
}, [id, formState, queryClient]);
```

For mutations that affect list views, use `router.invalidate()` instead of targeted key
invalidation.

### Error boundaries

Three layers handle errors:

| Layer | Handles | Mechanism |
|-------|---------|-----------|
| Router `defaultErrorComponent` | Loader rejections | `RouteError` in `createRouter()` config |
| `QueryBoundary` | Component-level suspense query errors | `QueryErrorResetBoundary` + `react-error-boundary` + `<Suspense>` |
| `panel-frame.tsx` | Panel data polling errors | `useQuery` error prop (manual) |

`QueryBoundary` composes `QueryErrorResetBoundary` > `ErrorBoundary` > `<Suspense>`. Use it
around any component that calls `useSuspenseQuery` outside a route loader:

```tsx
<QueryBoundary pendingFallback={<MySkeleton />}>
  <ComponentWithSuspenseQuery />
</QueryBoundary>
```

Routes with loaders use `pendingComponent` instead (the router manages pending/error):

```ts
export const Route = createFileRoute('/dashboards/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardsQueryOptions()),
  pendingComponent: DashboardListSkeleton,
  component: DashboardListPage,
});
```

### Pending states taxonomy

| Context | Pending handler | Error handler |
|---------|-----------------|---------------|
| Route with loader | `pendingComponent` on route config | Router `defaultErrorComponent` |
| Component with `useSuspenseQuery` (no loader) | `QueryBoundary` Suspense | `QueryBoundary` ErrorBoundary |
| Panel data polling | `panel-frame.tsx` props | `panel-frame.tsx` props |
| Mutations | Manual `useState(false)` | Manual try/catch |

### Skeleton convention

Skeleton components live in `apps/web/src/components/skeletons/`. Each matches the layout
shape of the page it represents using `<Skeleton>` from `@graflare/ui/components/skeleton`.

### Mutation pending states

Manual `useState` — no `useMutation`, no `useTransition`:

```ts
const [saving, setSaving] = useState(false);
```

### Polling data (panels)

`useQuery()` with `enabled` + `refetchInterval` — not Suspense:

```ts
useQuery({
  queryKey: ['panel-data', datasourceId, queries, timeRange],
  enabled: datasourceId !== undefined && queries.length > 0,
  refetchInterval,
  refetchIntervalInBackground: false,
});
```

### Query keys in use

`['dashboards']`, `['dashboard', id]`, `['dashboard-versions', dashboardId]`,
`['datasources']`, `['datasource', id]`, `['folders']`,
`['panel-data', datasourceId, queries, timeRange]`

### Router configuration

```ts
// apps/web/src/router.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30_000),
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultErrorComponent: RouteError,
  scrollRestoration: true,
});

setupRouterSsrQueryIntegration({ router, queryClient });
```

Root route: `createRootRouteWithContext<{ queryClient: QueryClient }>()`.
Devtools: `<TanStackRouterDevtools position='bottom-right' />` in `__root.tsx`.

### Navigation

```tsx
<Link to="/dashboards/$id" params={{ id }}>…</Link>
navigate({ to: '/datasources' })
```

### Route structure

File-based. `-` prefix for colocated non-route directories (e.g. `datasources/-components/`).
`$param` for dynamic segments. Layout routes render `<Outlet/>` with index content in
`$param/index.tsx`.

## Table & Virtual

`@tanstack/react-table` and `@tanstack/react-virtual` are installed but have no Intent skills
and no established project-wide patterns yet. When working with these, read the existing usage
in `apps/web/src/` and consult the official docs.

## When Intent fails

If `pnpm intent load` returns no matching skill or the skill doesn't cover your case:

1. Check [TanStack docs](https://tanstack.com) for the specific package
2. WebSearch for the exact API + version (e.g. `"@tanstack/react-router" 1.170 useNavigate`)
3. Read existing Graflare code in `apps/web/src/` for established patterns
4. For React Query specifically — the Graflare conventions above ARE the source of truth
