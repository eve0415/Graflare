import * as z from 'zod/mini';

import { panelSchema } from './panel';
import { timeRangeSchema } from './time-range';
import { variableSchema } from './variable';

export const dashboardSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  folderId: z.nullable(z.uuid()),
  title: z.string().check(z.minLength(1), z.maxLength(512)),
  slug: z.string().check(z.minLength(1), z.maxLength(512)),
  description: z._default(z.string().check(z.maxLength(4096)), ''),
  tags: z._default(z.array(z.string().check(z.maxLength(64))), []),
  panels: z._default(z.array(panelSchema), []),
  variables: z._default(z.array(variableSchema), []),
  timeRange: z._default(timeRangeSchema, { from: 'now-1h', to: 'now', refresh: null }),
  version: z._default(z.int().check(z.minimum(1)), 1),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

export const createDashboardSchema = z.object({
  title: z.string().check(z.minLength(1), z.maxLength(512)),
  folderId: z._default(z.nullable(z.uuid()), null),
  description: z._default(z.string().check(z.maxLength(4096)), ''),
  tags: z._default(z.array(z.string().check(z.maxLength(64))), []),
  panels: z._default(z.array(panelSchema), []),
  variables: z._default(z.array(variableSchema), []),
  timeRange: z._default(timeRangeSchema, { from: 'now-1h', to: 'now', refresh: null }),
});

export type CreateDashboard = z.infer<typeof createDashboardSchema>;

export const updateDashboardSchema = z.object({
  title: z.optional(z.string().check(z.minLength(1), z.maxLength(512))),
  folderId: z.optional(z.nullable(z.uuid())),
  description: z.optional(z.string().check(z.maxLength(4096))),
  tags: z.optional(z.array(z.string().check(z.maxLength(64)))),
  panels: z.optional(z.array(panelSchema)),
  variables: z.optional(z.array(variableSchema)),
  timeRange: z.optional(timeRangeSchema),
  message: z._default(z.string().check(z.maxLength(1024)), ''),
});

export type UpdateDashboard = z.infer<typeof updateDashboardSchema>;

export const dashboardIdParamSchema = z.object({ id: z.uuid() });

export const dashboardVersionParamSchema = z.object({
  id: z.uuid(),
  version: z.string().check(z.regex(/^\d+$/)),
});

export const dashboardVersionSchema = z.object({
  id: z.uuid(),
  dashboardId: z.uuid(),
  version: z.int().check(z.minimum(1)),
  data: z.string(),
  message: z._default(z.string().check(z.maxLength(1024)), ''),
  createdBy: z._default(z.string().check(z.maxLength(255)), ''),
  createdAt: z.int(),
});

export type DashboardVersion = z.infer<typeof dashboardVersionSchema>;

export const dashboardListQuerySchema = z.object({
  folderId: z.optional(z.uuid()),
  tag: z.optional(z.string()),
  search: z.optional(z.string().check(z.maxLength(256))),
});

export type DashboardListQuery = z.infer<typeof dashboardListQuerySchema>;

export const importDashboardSchema = z.object({
  json: z.record(z.string(), z.unknown()),
  format: z.optional(z.enum(['classic', 'v1', 'v2'])),
  folderId: z.optional(z.uuid()),
});

export type ImportDashboard = z.infer<typeof importDashboardSchema>;
