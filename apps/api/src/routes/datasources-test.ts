import { Hono } from "hono"
import { eq, and } from "drizzle-orm"
import { createDb } from "../db"
import { datasources } from "../db/schema"
import { decryptCredentials } from "../crypto/credentials"
import type { AppEnv } from "../index"

const app = new Hono<AppEnv>()

app.post("/:id/test", async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")
  const id = c.req.param("id")

  const rows = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404)
  }

  const ds = rows[0]!
  const start = Date.now()

  try {
    const headers: Record<string, string> = {}

    if (ds.credentials) {
      const creds = JSON.parse(
        await decryptCredentials(ds.credentials, c.env.ENCRYPTION_KEY),
      )
      if (ds.authType === "basic" && creds.username && creds.password) {
        headers["Authorization"] =
          `Basic ${btoa(`${creds.username}:${creds.password}`)}`
      } else if (ds.authType === "bearer" && creds.token) {
        headers["Authorization"] = `Bearer ${creds.token}`
      }
    }

    const res = await fetch(`${ds.url}/api/v1/labels?limit=1`, {
      headers,
      signal: AbortSignal.timeout(ds.queryTimeoutMs),
    })

    const latencyMs = Date.now() - start

    if (!res.ok) {
      return c.json({
        success: false,
        error: `Upstream returned ${res.status}`,
        latencyMs,
      })
    }

    return c.json({ success: true, latencyMs })
  } catch (err) {
    const latencyMs = Date.now() - start
    const message = err instanceof Error ? err.message : "Connection failed"
    return c.json({ success: false, error: message, latencyMs })
  }
})

export { app as datasourceTestRoutes }
