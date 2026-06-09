import * as z from 'zod/mini';

import { grafanaOverrideSchema, grafanaTransformationSchema } from './grafana-classic';

const v2QuerySchema = z.object({
  refId: z._default(z.string(), ''),
  expr: z._default(z.string(), ''),
  legendFormat: z._default(z.string(), ''),
});

// Per-element `options` bag — same shape and purpose as the classic adapter's. Only the
// text panel's content+mode are consumed; mode is a free string clamped in the adapter.
const v2ElementOptionsSchema = z.object({
  content: z._default(z.string(), ''),
  mode: z._default(z.string(), 'markdown'),
});

const v2ElementSpecSchema = z.object({
  title: z._default(z.string(), ''),
  data: z._default(
    z.object({
      queries: z._default(z.array(v2QuerySchema), []),
      // Transformations live under `spec.data` in this simplified v2 layout (the adapter reads them
      // from here). Defaults to empty so an element without transformations maps to `[]`.
      transformations: z._default(z.array(grafanaTransformationSchema), []),
    }),
    { queries: [], transformations: [] },
  ),
  options: z.optional(v2ElementOptionsSchema),
  // Per-field overrides, reusing the classic override shape. NB: this follows the adapter's
  // existing simplified `element.spec` layout — canonical Grafana v2alpha1 nests fieldConfig
  // under `vizConfig.spec`, which this adapter does not model for any field yet. Optional, so
  // an element without it maps to `[]`.
  fieldConfig: z.optional(
    z.object({
      overrides: z._default(z.array(grafanaOverrideSchema), []),
    }),
  ),
});

const v2ElementSchema = z.object({
  kind: z._default(z.string(), 'unknown'),
  // The fallback literal spells out `data.transformations: []` for the same reason `overrides: []` is
  // spelled out in grafana-classic: Zod `_default` returns the literal as-is when `spec` is absent
  // (it doesn't re-run the inner schema to fill `transformations`), so an element with no `spec` would
  // otherwise leave it undefined and crash the transformation mapper's for…of.
  spec: z._default(v2ElementSpecSchema, { title: '', data: { queries: [], transformations: [] } }),
});

export type V2Element = z.infer<typeof v2ElementSchema>;

const v2LayoutItemSchema = z.object({
  element: z.string(),
  x: z._default(z.number(), 0),
  y: z._default(z.number(), 0),
  width: z._default(z.number(), 12),
  height: z._default(z.number(), 8),
});

const v2LayoutSchema = z.object({
  items: z._default(z.array(v2LayoutItemSchema), []),
});

const v2VariableSchema = z.object({
  name: z._default(z.string(), ''),
  type: z._default(z.string(), 'custom'),
  label: z._default(z.string(), ''),
  query: z._default(z.string(), ''),
  multi: z._default(z.boolean(), false),
  includeAll: z._default(z.boolean(), false),
});

export type V2Variable = z.infer<typeof v2VariableSchema>;

export const grafanaV2Schema = z.object({
  apiVersion: z.string(),
  metadata: z._default(
    z.object({
      name: z._default(z.string(), ''),
      labels: z._default(z.record(z.string(), z.string()), {}),
    }),
    { name: '', labels: {} },
  ),
  spec: z._default(
    z.object({
      title: z._default(z.string(), ''),
      description: z._default(z.string(), ''),
      elements: z._default(z.record(z.string(), v2ElementSchema), {}),
      layout: z._default(v2LayoutSchema, { items: [] }),
      variables: z._default(z.array(v2VariableSchema), []),
    }),
    { title: '', description: '', elements: {}, layout: { items: [] }, variables: [] },
  ),
});

export type GrafanaV2Dashboard = z.infer<typeof grafanaV2Schema>;
