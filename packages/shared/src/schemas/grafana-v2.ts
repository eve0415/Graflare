import * as z from 'zod/mini';

const v2QuerySchema = z.object({
  refId: z._default(z.string(), ''),
  expr: z._default(z.string(), ''),
  legendFormat: z._default(z.string(), ''),
});

const v2ElementSpecSchema = z.object({
  title: z._default(z.string(), ''),
  data: z._default(
    z.object({
      queries: z._default(z.array(v2QuerySchema), []),
    }),
    { queries: [] },
  ),
});

const v2ElementSchema = z.object({
  kind: z._default(z.string(), 'unknown'),
  spec: z._default(v2ElementSpecSchema, { title: '', data: { queries: [] } }),
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
