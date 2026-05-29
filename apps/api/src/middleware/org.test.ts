import { env } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { createDb } from "../db"
import { organizations } from "../db/schema"
import { emailToOrgId } from "./org"

describe("org middleware", () => {
  beforeEach(async () => {
    const db = createDb(env.DB)
    await db.delete(organizations)
  })

  it("generates deterministic org ID from email", async () => {
    const id1 = await emailToOrgId("test@example.com")
    const id2 = await emailToOrgId("test@example.com")
    expect(id1).toBe(id2)
    expect(id1).toMatch(/^org-[0-9a-f]{32}$/)
  })

  it("generates same ID regardless of email case", async () => {
    const id1 = await emailToOrgId("Test@Example.com")
    const id2 = await emailToOrgId("test@example.com")
    expect(id1).toBe(id2)
  })

  it("generates different IDs for different emails", async () => {
    const id1 = await emailToOrgId("alice@example.com")
    const id2 = await emailToOrgId("bob@example.com")
    expect(id1).not.toBe(id2)
  })

  it("creates org on first login", async () => {
    const db = createDb(env.DB)
    const orgId = await emailToOrgId("newuser@example.com")

    const before = await db.select().from(organizations).where(eq(organizations.id, orgId))
    expect(before).toHaveLength(0)

    await db.insert(organizations).values({
      id: orgId,
      name: "newuser@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const after = await db.select().from(organizations).where(eq(organizations.id, orgId))
    expect(after).toHaveLength(1)
    const [org] = after
    expect(org?.name).toBe("newuser@example.com")
  })
})
