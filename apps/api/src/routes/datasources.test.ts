import { env } from "cloudflare:workers"
import { describe, expect, it, beforeEach } from "vitest"
import { createDb } from "../db"
import { datasources, organizations } from "../db/schema"
import { datasourceRoutes } from "./datasources"
import { Hono } from "hono"
import type { AppEnv } from "../index"

const TEST_ORG_ID = "org-test-123"
const TEST_ENCRYPTION_KEY = btoa(
  String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
)

function createApp() {
  const app = new Hono<AppEnv>()
  app.use("/*", async (c, next) => {
    c.set("orgId", TEST_ORG_ID)
    c.set("user", { email: "test@example.com", name: "Test" })
    await next()
  })
  app.route("/", datasourceRoutes)
  return app
}

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init)
}

describe("datasource routes", () => {
  beforeEach(async () => {
    const db = createDb(env.DB)
    await db.delete(datasources)
    await db.delete(organizations)
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: "Test Org",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it("lists datasources (empty)", async () => {
    const app = createApp()
    const res = await app.request(req("/"), {}, {
      DB: env.DB,
      ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    } as unknown as AppEnv["Bindings"])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it("creates a datasource", async () => {
    const app = createApp()
    const res = await app.request(
      req("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Prom",
          type: "prometheus",
          url: "https://prom.example.com",
          authType: "none",
        }),
      }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.name).toBe("Test Prom")
    expect(body.id).toBeDefined()
    expect(body).not.toHaveProperty("credentials")
  })

  it("creates with credentials (encrypted)", async () => {
    const app = createApp()
    const res = await app.request(
      req("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Authed Prom",
          type: "prometheus",
          url: "https://prom.example.com",
          authType: "bearer",
          credentials: { token: "my-secret-token" },
        }),
      }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(201)

    const db = createDb(env.DB)
    const rows = await db.select().from(datasources)
    expect(rows[0]!.credentials).toBeDefined()
    expect(rows[0]!.credentials).not.toContain("my-secret-token")
  })

  it("rejects invalid create input", async () => {
    const app = createApp()
    const res = await app.request(
      req("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", type: "invalid" }),
      }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(400)
  })

  it("gets a datasource by id", async () => {
    const app = createApp()
    const createRes = await app.request(
      req("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Get Test",
          type: "prometheus",
          url: "https://prom.example.com",
          authType: "none",
        }),
      }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    const created = await createRes.json() as Record<string, unknown>

    const res = await app.request(
      req(`/${created.id}`),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.name).toBe("Get Test")
  })

  it("returns 404 for nonexistent datasource", async () => {
    const app = createApp()
    const res = await app.request(
      req("/nonexistent-id"),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(404)
  })

  it("updates a datasource", async () => {
    const app = createApp()
    const createRes = await app.request(
      req("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Before Update",
          type: "prometheus",
          url: "https://prom.example.com",
          authType: "none",
        }),
      }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    const created = await createRes.json() as Record<string, unknown>

    const res = await app.request(
      req(`/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "After Update" }),
      }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.name).toBe("After Update")
  })

  it("deletes a datasource", async () => {
    const app = createApp()
    const createRes = await app.request(
      req("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "To Delete",
          type: "prometheus",
          url: "https://prom.example.com",
          authType: "none",
        }),
      }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    const created = await createRes.json() as Record<string, unknown>

    const res = await app.request(
      req(`/${created.id}`, { method: "DELETE" }),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(204)

    const getRes = await app.request(
      req(`/${created.id}`),
      {},
      { DB: env.DB, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY } as unknown as AppEnv["Bindings"],
    )
    expect(getRes.status).toBe(404)
  })
})
