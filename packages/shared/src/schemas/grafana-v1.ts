import * as z from 'zod/mini';

import { grafanaClassicSchema } from './grafana-classic';

export const grafanaV1Schema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Dashboard'),
  metadata: z._default(
    z.object({
      name: z._default(z.string(), ''),
      namespace: z._default(z.string(), ''),
    }),
    { name: '', namespace: '' },
  ),
  spec: grafanaClassicSchema,
});

export type GrafanaV1Dashboard = z.infer<typeof grafanaV1Schema>;
