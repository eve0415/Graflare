import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import {
  datasourceAuthType,
  datasourceCredentialsSchema,
} from "@graflare/shared/schemas/datasource"
import type { DatasourceCredentials } from "@graflare/shared/schemas/datasource"
import { decryptCredentials } from "../crypto/credentials"
import { createDb } from "../db"
import { datasources } from "../db/schema"
import { PrometheusClient } from "../prometheus/client"
import type { AppEnv } from "../index"

const app = new Hono<AppEnv>()

const getClient = async (c: {
  env: AppEnv["Bindings"]
  get: (key: string) => string
  req: { param: (key: string) => string }
}) => {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")
  const id = c.req.param("id")

  const rows = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1)

  const [ds] = rows
  if (ds === undefined) return null

  let credentials: DatasourceCredentials | undefined

  if (ds.credentials !== null) {
    credentials = datasourceCredentialsSchema.parse(
      JSON.parse(await decryptCredentials(ds.credentials, c.env.ENCRYPTION_KEY)),
    )
  }

  return new PrometheusClient(
    ds.url,
    {
      type: datasourceAuthType.parse(ds.authType),
      ...(credentials !== undefined && { credentials }),
    },
    ds.queryTimeoutMs,
  )
}

app.post("/:id/proxy/api/v1/query", async (c) => {
  const client = await getClient(c)
  if (!client) return c.json({ status: "error", error: "Not found" }, 404)

  const body = await c.req.parseBody()
  const query = typeof body.query === "string" ? body.query : ""
  const time = typeof body.time === "string" ? Number(body.time) : undefined
  const result = await client.instantQuery(query, time)
  return c.json(result)
})

app.post("/:id/proxy/api/v1/query_range", async (c) => {
  const client = await getClient(c)
  if (!client) return c.json({ status: "error", error: "Not found" }, 404)

  const body = await c.req.parseBody()
  const query = typeof body.query === "string" ? body.query : ""
  const step = typeof body.step === "string" ? body.step : ""
  const result = await client.rangeQuery(
    query,
    Number(body.start),
    Number(body.end),
    step,
  )
  return c.json(result)
})

app.get("/:id/proxy/api/v1/labels", async (c) => {
  const client = await getClient(c)
  if (!client) return c.json({ status: "error", error: "Not found" }, 404)

  const match = c.req.queries("match[]")
  const result = await client.labels(match)
  return c.json(result)
})

app.get("/:id/proxy/api/v1/label/:name/values", async (c) => {
  const client = await getClient(c)
  if (!client) return c.json({ status: "error", error: "Not found" }, 404)

  const match = c.req.queries("match[]")
  const result = await client.labelValues(c.req.param("name"), match)
  return c.json(result)
})

export { app as proxyRoutes }
