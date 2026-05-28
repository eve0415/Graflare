import { createServerFn } from "@tanstack/react-start"
import type { CreateDatasource, UpdateDatasource } from "@graflare/shared/schemas/datasource"

export const listDatasources = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const env = (context as { cloudflare?: { env: Record<string, unknown> } })
      .cloudflare?.env
    if (!env?.API) return []
    const api = env.API as { listDatasources(orgId: string): Promise<unknown[]> }
    return api.listDatasources("default")
  },
)

export const getDatasource = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id, context }) => {
    const env = (context as { cloudflare?: { env: Record<string, unknown> } })
      .cloudflare?.env
    if (!env?.API) return null
    const api = env.API as {
      getDatasource(orgId: string, id: string): Promise<unknown>
    }
    return api.getDatasource("default", id)
  })

export const createDatasource = createServerFn({ method: "POST" })
  .validator((input: CreateDatasource) => input)
  .handler(async ({ data, context }) => {
    const env = (context as { cloudflare?: { env: Record<string, unknown> } })
      .cloudflare?.env
    if (!env?.API) throw new Error("API not available")
    const api = env.API as {
      createDatasource(orgId: string, input: CreateDatasource): Promise<unknown>
    }
    return api.createDatasource("default", data)
  })

export const updateDatasource = createServerFn({ method: "POST" })
  .validator((input: { id: string; data: UpdateDatasource }) => input)
  .handler(async ({ data: { id, data }, context }) => {
    const env = (context as { cloudflare?: { env: Record<string, unknown> } })
      .cloudflare?.env
    if (!env?.API) throw new Error("API not available")
    const api = env.API as {
      updateDatasource(
        orgId: string,
        id: string,
        input: UpdateDatasource,
      ): Promise<unknown>
    }
    return api.updateDatasource("default", id, data)
  })

export const deleteDatasource = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id, context }) => {
    const env = (context as { cloudflare?: { env: Record<string, unknown> } })
      .cloudflare?.env
    if (!env?.API) throw new Error("API not available")
    const api = env.API as {
      deleteDatasource(orgId: string, id: string): Promise<void>
    }
    await api.deleteDatasource("default", id)
  })

export const testConnection = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id, context }) => {
    const env = (context as { cloudflare?: { env: Record<string, unknown> } })
      .cloudflare?.env
    if (!env?.API) throw new Error("API not available")
    const api = env.API as {
      testConnection(
        orgId: string,
        id: string,
      ): Promise<{ success: boolean; latencyMs: number; error?: string }>
    }
    return api.testConnection("default", id)
  })

export const proxyQuery = createServerFn({ method: "POST" })
  .validator(
    (input: {
      datasourceId: string
      endpoint: string
      params: Record<string, string>
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const env = (context as { cloudflare?: { env: Record<string, unknown> } })
      .cloudflare?.env
    if (!env?.API) throw new Error("API not available")
    const api = env.API as {
      proxyQuery(
        orgId: string,
        datasourceId: string,
        endpoint: string,
        params: Record<string, string>,
      ): Promise<unknown>
    }
    return api.proxyQuery("default", data.datasourceId, data.endpoint, data.params)
  })
