import { Hono } from "hono"
import { eq, and } from "drizzle-orm"
import { createDatasourceSchema, updateDatasourceSchema } from "@graflare/shared/schemas/datasource"
import { createDb } from "../db"
import { datasources } from "../db/schema"
import { encryptCredentials } from "../crypto/credentials"
import type { AppEnv } from "../index"

const app = new Hono<AppEnv>()

app.get("/", async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")

  const rows = await db
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

  return c.json(rows)
})

app.get("/:id", async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")
  const id = c.req.param("id")

  const rows = await db
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

  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404)
  }

  return c.json(rows[0])
})

app.post("/", async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")

  const body = await c.req.json()
  const parsed = createDatasourceSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400)
  }

  const { credentials, ...rest } = parsed.data
  const id = crypto.randomUUID()
  const now = new Date()

  let encryptedCreds: string | null = null
  if (credentials) {
    encryptedCreds = await encryptCredentials(
      JSON.stringify(credentials),
      c.env.ENCRYPTION_KEY,
    )
  }

  await db.insert(datasources).values({
    id,
    orgId,
    ...rest,
    credentials: encryptedCreds,
    createdAt: now,
    updatedAt: now,
  })

  return c.json(
    {
      id,
      orgId,
      ...rest,
      createdAt: now,
      updatedAt: now,
    },
    201,
  )
})

app.put("/:id", async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")
  const id = c.req.param("id")

  const existing = await db
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1)

  if (existing.length === 0) {
    return c.json({ error: "Not found" }, 404)
  }

  const body = await c.req.json()
  const parsed = updateDatasourceSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400)
  }

  const { credentials, ...rest } = parsed.data
  const now = new Date()

  let encryptedCreds: string | undefined
  if (credentials) {
    encryptedCreds = await encryptCredentials(
      JSON.stringify(credentials),
      c.env.ENCRYPTION_KEY,
    )
  }

  await db
    .update(datasources)
    .set({
      ...rest,
      ...(encryptedCreds !== undefined && { credentials: encryptedCreds }),
      updatedAt: now,
    })
    .where(eq(datasources.id, id))

  const updated = await db
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
    .where(eq(datasources.id, id))
    .limit(1)

  return c.json(updated[0])
})

app.delete("/:id", async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get("orgId")
  const id = c.req.param("id")

  const existing = await db
    .select({ id: datasources.id })
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1)

  if (existing.length === 0) {
    return c.json({ error: "Not found" }, 404)
  }

  await db.delete(datasources).where(eq(datasources.id, id))

  return c.body(null, 204)
})

export { app as datasourceRoutes }
