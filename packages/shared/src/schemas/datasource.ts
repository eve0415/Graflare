import { z } from "zod"

export const datasourceAuthType = z.enum(["none", "basic", "bearer"])
export type DatasourceAuthType = z.infer<typeof datasourceAuthType>

export const datasourceType = z.enum(["prometheus"])
export type DatasourceType = z.infer<typeof datasourceType>

export const datasourceSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: datasourceType,
  url: z.string().url(),
  authType: datasourceAuthType,
  queryTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type Datasource = z.infer<typeof datasourceSchema>

export const createDatasourceSchema = datasourceSchema
  .omit({
    id: true,
    orgId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    credentials: z
      .object({
        username: z.string().optional(),
        password: z.string().optional(),
        token: z.string().optional(),
      })
      .optional(),
  })

export type CreateDatasource = z.infer<typeof createDatasourceSchema>

export const updateDatasourceSchema = createDatasourceSchema.partial()

export type UpdateDatasource = z.infer<typeof updateDatasourceSchema>
