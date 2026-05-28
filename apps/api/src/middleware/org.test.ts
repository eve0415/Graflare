import { env } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { describe, expect, it, beforeEach } from "vitest"
import { createDb } from "../db"
import { organizations } from "../db/schema"
import { emailToOrgId } from "./org"

describe("org middleware", () => {
  beforeEach(async () => {
    const db = createDb(env.DB)
    await db.delete(organizations)
  })

  it("generates deterministic org ID from email", () => {
    const id1 = emailToOrgId("test@example.com")
    const id2 = emailToOrgId("test@example.com")
    expect(id1).toBe(id2)
    expect(id1).toMatch(/^org-[0-9a-f]{8}$/)
  })

  it("generates same ID regardless of email case", () => {
    const id1 = emailToOrgId("Test@Example.com")
    const id2 = emailToOrgId("test@example.com")
    expect(id1).toBe(id2)
  })

  it("generates different IDs for different emails", () => {
    const id1 = emailToOrgId("alice@example.com")
    const id2 = emailToOrgId("bob@example.com")
    expect(id1).not.toBe(id2)
  })

  it("creates org on first login", async () => {
    const db = createDb(env.DB)
    const orgId = emailToOrgId("newuser@example.com")

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
    expect(after[0]!.name).toBe("newuser@example.com")
  })
})
