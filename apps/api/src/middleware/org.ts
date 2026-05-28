import type { Context, MiddlewareHandler } from "hono"
import { eq } from "drizzle-orm"
import { createDb } from "../db"
import { organizations } from "../db/schema"
import type { AppEnv } from "../index"

export function orgMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next) => {
    const user = c.get("user")
    const db = createDb(c.env.DB)

    const orgId = emailToOrgId(user.email)
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
}

function emailToOrgId(email: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(email.toLowerCase())
  let hash = 0x811c9dc5
  for (const byte of data) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0")
  return `org-${hex}`
}

export { emailToOrgId }
