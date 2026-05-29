import { Hono } from "hono"
import { WorkerEntrypoint } from "cloudflare:workers"
import { and, eq } from "drizzle-orm"
import type {
  CreateDatasource,
  UpdateDatasource,
} from "@graflare/shared/schemas/datasource"
import {
  createDatasourceSchema,
  datasourceCredentialsSchema,
  updateDatasourceSchema,
} from "@graflare/shared/schemas/datasource"
import type { PrometheusResponse } from "@graflare/shared/schemas/prometheus"
import { prometheusResponseSchema } from "@graflare/shared/schemas/prometheus"
import { createDb } from "./db"
import { datasources } from "./db/schema"
import { accessMiddleware } from "./middleware/access"
import { orgMiddleware } from "./middleware/org"
import { datasourceRoutes } from "./routes/datasources"
import { datasourceTestRoutes } from "./routes/datasources-test"
import { proxyRoutes } from "./routes/proxy"
import { decryptCredentials, encryptCredentials } from "./crypto/credentials"

interface Bindings {
  DB: D1Database
  ENCRYPTION_KEY: string
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
}

export interface AppEnv {
  Bindings: Bindings
  Variables: {
    user: { email: string; name: string }
    orgId: string
  }
}

const app = new Hono<AppEnv>()

app.get("/health", (c) => c.json({ status: "ok" }))

app.use("/api/*", accessMiddleware())
app.use("/api/*", orgMiddleware())
app.route("/api/v1/datasources", datasourceRoutes)
app.route("/api/v1/datasources", datasourceTestRoutes)
app.route("/api/v1/datasources", proxyRoutes)

export default app

export class GraflareAPI extends WorkerEntrypoint<Bindings> {
  private get db() {
    return createDb(this.env.DB)
  }

  health(): Promise<{ status: string }> {
    return Promise.resolve({ status: "ok" })
  }

  async listDatasources(orgId: string) {
    return this.db
      .select({
        id: datasources.id,
        orgId: datasources.orgId,
        name: datasources.name,
        type: datasources.type,
        url: datasources.url,
        authType: datasources.authType,
        queryTimeoutMs: datasources.queryTimeoutMs,
        createdAt: datasources.createdAt,
        updatedAt: datasources.updatedAt,
      })
      .from(datasources)
      .where(eq(datasources.orgId, orgId))
  }

  async getDatasource(orgId: string, id: string) {
    const rows = await this.db
      .select({
        id: datasources.id,
        orgId: datasources.orgId,
        name: datasources.name,
        type: datasources.type,
        url: datasources.url,
        authType: datasources.authType,
        queryTimeoutMs: datasources.queryTimeoutMs,
        createdAt: datasources.createdAt,
        updatedAt: datasources.updatedAt,
      })
      .from(datasources)
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
      .limit(1)
    return rows[0] ?? null
  }

  async createDatasource(orgId: string, input: CreateDatasource) {
    const parsed = createDatasourceSchema.parse(input)
    const { credentials, ...rest } = parsed
    const id = crypto.randomUUID()
    const now = new Date()

    let encryptedCreds: string | null = null
    if (credentials) {
      encryptedCreds = await encryptCredentials(
        JSON.stringify(credentials),
        this.env.ENCRYPTION_KEY,
      )
    }

    await this.db.insert(datasources).values({
      id,
      orgId,
      ...rest,
      credentials: encryptedCreds,
      createdAt: now,
      updatedAt: now,
    })

    return { id, orgId, ...rest, createdAt: now, updatedAt: now }
  }

  async updateDatasource(orgId: string, id: string, input: UpdateDatasource) {
    const parsed = updateDatasourceSchema.parse(input)
    const { credentials, ...rest } = parsed
    const now = new Date()

    let encryptedCreds: string | undefined
    if (credentials) {
      encryptedCreds = await encryptCredentials(
        JSON.stringify(credentials),
        this.env.ENCRYPTION_KEY,
      )
    }

    await this.db
      .update(datasources)
      .set({
        ...rest,
        ...(encryptedCreds !== undefined && { credentials: encryptedCreds }),
        updatedAt: now,
      })
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))

    return this.getDatasource(orgId, id)
  }

  async deleteDatasource(orgId: string, id: string): Promise<void> {
    await this.db
      .delete(datasources)
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
  }

  async testConnection(
    orgId: string,
    id: string,
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const rows = await this.db
      .select()
      .from(datasources)
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
      .limit(1)

    const [ds] = rows
    if (ds === undefined) {
      return { success: false, latencyMs: 0, error: "Not found" }
    }

    const start = Date.now()

    try {
      const headers: Record<string, string> = {}
      if (ds.credentials) {
        const creds = datasourceCredentialsSchema.parse(
          JSON.parse(
            await decryptCredentials(ds.credentials, this.env.ENCRYPTION_KEY),
          ),
        )
        if (
          ds.authType === "basic" &&
          creds.username !== undefined &&
          creds.password !== undefined
        ) {
          headers["Authorization"] =
            `Basic ${btoa(`${creds.username}:${creds.password}`)}`
        } else if (ds.authType === "bearer" && creds.token !== undefined) {
          headers["Authorization"] = `Bearer ${creds.token}`
        }
      }

      const res = await fetch(`${ds.url}/api/v1/labels?limit=1`, {
        headers,
        signal: AbortSignal.timeout(ds.queryTimeoutMs),
      })

      const latencyMs = Date.now() - start
      if (!res.ok) {
        return { success: false, latencyMs, error: `Upstream returned ${res.status}` }
      }
      return { success: true, latencyMs }
    } catch (error) {
      const latencyMs = Date.now() - start
      const message = error instanceof Error ? error.message : "Connection failed"
      return { success: false, latencyMs, error: message }
    }
  }

  private static ALLOWED_ENDPOINTS = new Set([
    "/api/v1/query",
    "/api/v1/query_range",
    "/api/v1/labels",
    "/api/v1/series",
  ])

  async proxyQuery(
    orgId: string,
    datasourceId: string,
    endpoint: string,
    params: Record<string, string>,
  ): Promise<PrometheusResponse> {
    if (!GraflareAPI.ALLOWED_ENDPOINTS.has(endpoint) && !endpoint.startsWith("/api/v1/label/")) {
      return { status: "error", errorType: "bad_request", error: "Invalid endpoint" }
    }

    const rows = await this.db
      .select()
      .from(datasources)
      .where(and(eq(datasources.id, datasourceId), eq(datasources.orgId, orgId)))
      .limit(1)

    const [ds] = rows
    if (ds === undefined) {
      return { status: "error", errorType: "not_found", error: "Data source not found" }
    }

    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }

    try {
      const base = new URL(ds.url)
      base.pathname = base.pathname.replace(/\/$/, "") + endpoint
      const isPost = endpoint.includes("/query")

      const targetUrl = isPost
        ? base.toString()
        : `${base.toString()}?${new URLSearchParams(params).toString()}`

      if (new URL(targetUrl).origin !== base.origin) {
        return { status: "error", errorType: "bad_request", error: "URL origin mismatch" }
      }

      // Attach credentials only after confirming the target origin matches the datasource.
      if (ds.credentials) {
        const creds = datasourceCredentialsSchema.parse(
          JSON.parse(
            await decryptCredentials(ds.credentials, this.env.ENCRYPTION_KEY),
          ),
        )
        if (
          ds.authType === "basic" &&
          creds.username !== undefined &&
          creds.password !== undefined
        ) {
          headers["Authorization"] =
            `Basic ${btoa(`${creds.username}:${creds.password}`)}`
        } else if (ds.authType === "bearer" && creds.token !== undefined) {
          headers["Authorization"] = `Bearer ${creds.token}`
        }
      }

      const res = await fetch(targetUrl, {
        method: isPost ? "POST" : "GET",
        headers,
        ...(isPost && { body: new URLSearchParams(params).toString() }),
        signal: AbortSignal.timeout(ds.queryTimeoutMs),
      })

      return prometheusResponseSchema.parse(await res.json())
    } catch (error) {
      const message = error instanceof Error ? error.message : "Query failed"
      return { status: "error", errorType: "timeout", error: message }
    }
  }
}
