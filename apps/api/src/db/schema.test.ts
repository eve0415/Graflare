import { env } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { createDb } from "./index"
import { datasources, organizations } from "./schema"

const setup = () => {
  const db = createDb(env.DB)
  return { db }
}

const testOrg = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Test Org",
  createdAt: new Date(1716854400000),
  updatedAt: new Date(1716854400000),
}

const testDatasource = {
  id: "660e8400-e29b-41d4-a716-446655440000",
  orgId: testOrg.id,
  name: "Test Prometheus",
  type: "prometheus",
  url: "https://prom.example.com",
  authType: "bearer",
  queryTimeoutMs: 30000,
  createdAt: new Date(1716854400000),
  updatedAt: new Date(1716854400000),
}

describe("d1 schema", () => {
  beforeEach(async () => {
    const { db } = setup()
    await db.delete(datasources)
    await db.delete(organizations)
  })

  it("inserts and reads an organization", async () => {
    const { db } = setup()
    await db.insert(organizations).values(testOrg)
    const rows = await db.select().from(organizations)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.name).toBe("Test Org")
  })

  it("inserts and reads a datasource", async () => {
    const { db } = setup()
    await db.insert(organizations).values(testOrg)
    await db.insert(datasources).values(testDatasource)
    const rows = await db.select().from(datasources)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.name).toBe("Test Prometheus")
    expect(row?.orgId).toBe(testOrg.id)
  })

  it("updates a datasource", async () => {
    const { db } = setup()
    await db.insert(organizations).values(testOrg)
    await db.insert(datasources).values(testDatasource)
    await db
      .update(datasources)
      .set({ name: "Updated Name" })
      .where(eq(datasources.id, testDatasource.id))
    const rows = await db
      .select()
      .from(datasources)
      .where(eq(datasources.id, testDatasource.id))
    const [row] = rows
    expect(row?.name).toBe("Updated Name")
  })

  it("deletes a datasource", async () => {
    const { db } = setup()
    await db.insert(organizations).values(testOrg)
    await db.insert(datasources).values(testDatasource)
    await db.delete(datasources).where(eq(datasources.id, testDatasource.id))
    const rows = await db.select().from(datasources)
    expect(rows).toHaveLength(0)
  })

  it("enforces foreign key on datasource orgId", async () => {
    const { db } = setup()
    await expect(
      db.insert(datasources).values({
        ...testDatasource,
        orgId: "nonexistent-org-id",
      }),
    ).rejects.toThrow(/Failed query: insert into "datasources"/)
  })

  it("applies default auth_type", async () => {
    const { db } = setup()
    await db.insert(organizations).values(testOrg)
    const { authType: _, ...withoutAuth } = testDatasource
    await db.insert(datasources).values(withoutAuth)
    const rows = await db.select().from(datasources)
    const [row] = rows
    expect(row?.authType).toBe("none")
  })

  it("stores and retrieves encrypted credentials", async () => {
    const { db } = setup()
    await db.insert(organizations).values(testOrg)
    await db
      .insert(datasources)
      .values({ ...testDatasource, credentials: "encrypted-blob" })
    const rows = await db.select().from(datasources)
    const [row] = rows
    expect(row?.credentials).toBe("encrypted-blob")
  })
})
