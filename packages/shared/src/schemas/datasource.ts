import * as z from 'zod/mini';

import { datasourceIdSchema } from './ids';

export const datasourceAuthType = z.enum(['none', 'basic', 'bearer']);
export type DatasourceAuthType = z.infer<typeof datasourceAuthType>;

export const datasourceType = z.enum(['prometheus', 'sql']);
export type DatasourceType = z.infer<typeof datasourceType>;

export const datasourceDialect = z.enum(['sqlite', 'postgres']);
export type DatasourceDialect = z.infer<typeof datasourceDialect>;

export const datasourceCredentialsSchema = z.object({
  username: z.optional(z.string().check(z.maxLength(256))),
  password: z.optional(z.string().check(z.maxLength(1024))),
  token: z.optional(z.string().check(z.maxLength(4096))),
});

export type DatasourceCredentials = z.infer<typeof datasourceCredentialsSchema>;

export const datasourceSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  type: datasourceType,
  dialect: z.optional(datasourceDialect),
  url: z.url().check(z.maxLength(2048)),
  authType: datasourceAuthType,
  queryTimeoutMs: z._default(z.int().check(z.minimum(1000), z.maximum(120000)), 30000),
  // Per-datasource query-result cache TTL in seconds. 0 disables caching for
  // this datasource (query live every time); capped at one day.
  cacheTtl: z._default(z.int().check(z.minimum(0), z.maximum(86400)), 0),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type Datasource = z.infer<typeof datasourceSchema>;

export const createDatasourceSchema = z.extend(z.omit(datasourceSchema, { id: true, orgId: true, createdAt: true, updatedAt: true }), {
  credentials: z.optional(datasourceCredentialsSchema),
});

export type CreateDatasource = z.infer<typeof createDatasourceSchema>;

export const updateDatasourceSchema = z.partial(createDatasourceSchema);

export type UpdateDatasource = z.infer<typeof updateDatasourceSchema>;

// Web server-fn input for updateDatasource: { id, data }. Lives here (not in
// proxy.ts) because it composes updateDatasourceSchema.
export const updateDatasourceInputSchema = z.object({
  id: datasourceIdSchema,
  data: updateDatasourceSchema,
});

export type UpdateDatasourceInput = z.infer<typeof updateDatasourceInputSchema>;

export const testConnectionInlineSchema = z.object({
  type: datasourceType,
  url: z.url().check(z.maxLength(2048)),
  authType: datasourceAuthType,
  credentials: z.optional(datasourceCredentialsSchema),
  queryTimeoutMs: z._default(z.int().check(z.minimum(1000), z.maximum(120000)), 30000),
});

export type TestConnectionInline = z.infer<typeof testConnectionInlineSchema>;
