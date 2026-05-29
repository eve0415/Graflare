import type { Context, MiddlewareHandler } from "hono"
import { eq } from "drizzle-orm"
import { createDb } from "../db"
import { organizations } from "../db/schema"
import type { AppEnv } from "../index"

const emailToOrgId = async (email: string): Promise<string> => {
  const data = new TextEncoder().encode(email.toLowerCase())
  const digest = await crypto.subtle.digest("SHA-256", data)
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `org-${hex.slice(0, 32)}`
}

const orgMiddleware =
  (): MiddlewareHandler<AppEnv> =>
  async (c: Context<AppEnv>, next) => {
    const user = c.get("user")
    const db = createDb(c.env.DB)

    const orgId = await emailToOrgId(user.email)
    const existing = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)

    if (existing.length === 0) {
      const now = new Date()
      await db.insert(organizations).values({
        id: orgId,
        name: user.email,
        createdAt: now,
        updatedAt: now,
      })
    }

    c.set("orgId", orgId)
    await next()
  }

export { emailToOrgId, orgMiddleware }
