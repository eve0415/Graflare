import * as z from 'zod/mini';

// `textbox`/`interval`/`datasource`/`adhoc` reuse the flat shape: textbox seeds from
// `current`/`query`, interval lists its choices in `options`, datasource keeps an optional
// data-source-type filter (e.g. 'prometheus') in `query`, and adhoc carries its label matchers in
// `filters` (scoped to `datasourceId`). No required per-type fields are added — `filters` defaults
// to `[]` — so dashboards saved before these types parse unchanged.
export const variableTypeSchema = z.enum(['query', 'custom', 'constant', 'textbox', 'interval', 'datasource', 'adhoc']);

export type VariableType = z.infer<typeof variableTypeSchema>;

export const variableSortSchema = z.enum(['disabled', 'alphabetical-asc', 'alphabetical-desc', 'numerical-asc', 'numerical-desc']);

export type VariableSort = z.infer<typeof variableSortSchema>;

// The label-matcher operators a Prometheus adhoc filter can use, mirroring PromQL's `=`/`!=`/`=~`/
// `!~`. Kept as an enum (not a boolean equals/not-equals) so regex matchers are first-class and a
// future operator is an additive change. Grafana's classic adhoc filters store the same strings.
export const adhocOperatorSchema = z.enum(['=', '!=', '=~', '!~']);

export type AdhocOperator = z.infer<typeof adhocOperatorSchema>;

// One adhoc label filter: a label `key`, an `operator`, and the `value` to match. This is the
// matcher injected into every vector selector of a query scoped to the variable's datasource.
// Mirrors Grafana's `AdHocFilterWithLabels` (the relevant subset — `values[]`/`condition` aren't
// modeled yet; an importer that sees them collapses to this single-value form).
export const adhocFilterSchema = z.object({
  key: z.string().check(z.minLength(1), z.maxLength(255)),
  operator: adhocOperatorSchema,
  value: z._default(z.string().check(z.maxLength(2048)), ''),
});

export type AdhocFilter = z.infer<typeof adhocFilterSchema>;

export const variableSchema = z.object({
  name: z.string().check(z.minLength(1), z.maxLength(128)),
  type: variableTypeSchema,
  label: z._default(z.string().check(z.maxLength(255)), ''),
  datasourceId: z.optional(z.uuid()),
  query: z._default(z.string().check(z.maxLength(8192)), ''),
  regex: z._default(z.string().check(z.maxLength(2048)), ''),
  sort: z._default(variableSortSchema, 'disabled'),
  multi: z._default(z.boolean(), false),
  includeAll: z._default(z.boolean(), false),
  // The saved selection: a plain string for single-select variables, a string array for a
  // multi/include-all selection. Widened additively — dashboards saved before multi-select
  // existed hold plain strings and parse unchanged.
  current: z._default(z.union([z.string(), z.array(z.string())]), ''),
  // Custom "All" value, used VERBATIM at interpolation time (never escaped). Empty means no
  // custom value, so an All selection expands over the option list instead.
  allValue: z._default(z.string(), ''),
  options: z._default(z.array(z.string()), []),
  // Adhoc label filters. Empty for every non-adhoc type (and an adhoc variable with none),
  // so it is purely additive: dashboards saved before adhoc existed omit the key and default to [].
  filters: z._default(z.array(adhocFilterSchema), []),
});

export type Variable = z.infer<typeof variableSchema>;
