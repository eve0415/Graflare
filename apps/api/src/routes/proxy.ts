import { Hono } from "hono"
import { eq, and } from "drizzle-orm"
import { createDb } from "../db"
import { datasources } from "../db/schema"
import { decryptCredentials } from "../crypto/credentials"
import { PrometheusClient } from "../prometheus/client"
import type { AppEnv } from "../index"

const app = new Hono<AppEnv>()

async function getClient(c: {
  env: AppEnv["Bindings"]
  get: (key: string) => string
  req: { param: (key: string) => string }
}) {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")
  const id = c.req.param("id")

  const rows = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1)

  if (rows.length === 0) return null

  const ds = rows[0]!
  let credentials: { username?: string; password?: string; token?: string } | undefined

  if (ds.credentials) {
    credentials = JSON.parse(
      await decryptCredentials(ds.credentials, c.env.ENCRYPTION_KEY),
    )
  }

  return new PrometheusClient(
    ds.url,
    {
      type: ds.authType as "none" | "basic" | "bearer",
      credentials,
    },
    ds.queryTimeoutMs,
  )
}

app.post("/:id/proxy/api/v1/query", async (c) => {
  const client = await getClient(c)
  if (!client) return c.json({ status: "error", error: "Not found" }, 404)

  const body = await c.req.parseBody()
  const result = await client.instantQuery(
    body.query as string,
    body.time ? Number(body.time) : undefined,
  )
  return c.json(result)
})

app.post("/:id/proxy/api/v1/query_range", async (c) => {
  const client = await getClient(c)
  if (!client) return c.json({ status: "error", error: "Not found" }, 404)

  const body = await c.req.parseBody()
  const result = await client.rangeQuery(
    body.query as string,
    Number(body.start),
    Number(body.end),
    body.step as string,
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
