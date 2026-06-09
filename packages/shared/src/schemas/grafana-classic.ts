import * as z from 'zod/mini';

const grafanaTargetSchema = z.object({
  refId: z._default(z.string(), ''),
  expr: z._default(z.string(), ''),
  legendFormat: z._default(z.string(), ''),
});

const grafanaGridPosSchema = z.object({
  x: z._default(z.number(), 0),
  y: z._default(z.number(), 0),
  w: z._default(z.number(), 12),
  h: z._default(z.number(), 8),
});

const grafanaThresholdStepSchema = z.object({
  value: z.nullable(z._default(z.number(), 0)),
  color: z._default(z.string(), 'green'),
});

// Grafana override entry as it appears in dashboard JSON: a matcher and a list of
// `{ id, value }` properties. `matcher.options` and property `value` are heterogeneous in
// Grafana (string | number | object | …); kept as `z.unknown()` here and narrowed with
// typeof in the adapter (this schema is import-only, parsed then discarded into our Panel,
// so it never crosses the RPC boundary where an unbounded type would blow the depth limit).
const grafanaOverrideSchema = z.object({
  matcher: z._default(
    z.object({
      id: z._default(z.string(), ''),
      options: z.optional(z.unknown()),
    }),
    { id: '', options: undefined },
  ),
  properties: z._default(z.array(z.object({ id: z._default(z.string(), ''), value: z.optional(z.unknown()) })), []),
});

export type GrafanaOverride = z.infer<typeof grafanaOverrideSchema>;

const grafanaFieldConfigSchema = z.object({
  defaults: z._default(
    z.object({
      thresholds: z._default(
        z.object({
          steps: z._default(z.array(grafanaThresholdStepSchema), []),
        }),
        { steps: [] },
      ),
    }),
    { thresholds: { steps: [] } },
  ),
  overrides: z._default(z.array(grafanaOverrideSchema), []),
});

// Per-panel `options` bag. Only the text panel's fields are modelled (content + mode);
// Grafana's `mode` is one of code/text/html/markdown — kept as a free string here and
// clamped to our markdown|html enum in the adapter. Extra keys from other panel types
// are ignored. Optional, since most panels carry no options we consume.
const grafanaPanelOptionsSchema = z.object({
  content: z._default(z.string(), ''),
  mode: z._default(z.string(), 'markdown'),
});

const grafanaBasePanelSchema = z.object({
  type: z._default(z.string(), 'unknown'),
  title: z._default(z.string(), ''),
  description: z._default(z.string(), ''),
  targets: z._default(z.array(grafanaTargetSchema), []),
  gridPos: z._default(grafanaGridPosSchema, { x: 0, y: 0, w: 12, h: 8 }),
  // The fallback literal must spell out `overrides: []` — a Zod `_default` returns the
  // literal as-is when the key is absent (it doesn't re-run the inner schema to fill
  // `overrides`), so a panel that omits `fieldConfig` would otherwise leave overrides
  // undefined and crash the override mapper's for…of.
  fieldConfig: z._default(grafanaFieldConfigSchema, { defaults: { thresholds: { steps: [] } }, overrides: [] }),
  options: z.optional(grafanaPanelOptionsSchema),
});

export type GrafanaBasePanel = z.infer<typeof grafanaBasePanelSchema>;

const grafanaPanelSchema = z.extend(grafanaBasePanelSchema, {
  panels: z._default(z.array(grafanaBasePanelSchema), []),
});

export type GrafanaPanel = z.infer<typeof grafanaPanelSchema>;

const grafanaCurrentSchema = z.object({
  value: z._default(z.union([z.string(), z.array(z.string())]), ''),
});

const grafanaVariableSchema = z.object({
  name: z._default(z.string(), ''),
  type: z._default(z.string(), 'custom'),
  label: z._default(z.nullable(z.string()), null),
  query: z._default(z.union([z.string(), z.record(z.string(), z.unknown())]), ''),
  regex: z._default(z.string(), ''),
  multi: z._default(z.boolean(), false),
  includeAll: z._default(z.boolean(), false),
  current: z._default(grafanaCurrentSchema, { value: '' }),
  options: z._default(z.array(z.object({ value: z._default(z.string(), '') })), []),
});

export type GrafanaVariable = z.infer<typeof grafanaVariableSchema>;

const grafanaTimeSchema = z.object({
  from: z._default(z.string(), 'now-1h'),
  to: z._default(z.string(), 'now'),
});

const grafanaTemplatingSchema = z.object({
  list: z._default(z.array(grafanaVariableSchema), []),
});

export const grafanaClassicSchema = z.object({
  title: z._default(z.string(), 'Imported Dashboard'),
  description: z._default(z.string(), ''),
  tags: z._default(z.array(z.string()), []),
  panels: z._default(z.array(grafanaPanelSchema), []),
  templating: z._default(grafanaTemplatingSchema, { list: [] }),
  time: z._default(grafanaTimeSchema, { from: 'now-1h', to: 'now' }),
});

export type GrafanaClassicDashboard = z.infer<typeof grafanaClassicSchema>;

export {
  grafanaBasePanelSchema,
  grafanaPanelSchema,
  grafanaTargetSchema,
  grafanaVariableSchema,
  grafanaTimeSchema,
  grafanaTemplatingSchema,
  grafanaFieldConfigSchema,
  grafanaThresholdStepSchema,
  grafanaGridPosSchema,
  grafanaOverrideSchema,
};
