import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { accessMiddleware } from "./access"
import type { AppEnv } from "../index"

function createApp() {
  const app = new Hono<AppEnv>()
  app.use("/*", accessMiddleware())
  app.get("/test", (c) => c.json({ user: c.get("user") }))
  return app
}

describe("access middleware", () => {
  it("returns 401 when no JWT header", async () => {
    const app = createApp()
    const res = await app.request("/test", {}, {
      ACCESS_TEAM_DOMAIN: "test-team",
    } as unknown as AppEnv["Bindings"])
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: "Missing Access JWT" })
  })

  it("returns 401 for invalid JWT format", async () => {
    const app = createApp()
    const res = await app.request(
      "/test",
      { headers: { "CF-Access-JWT-Assertion": "not-a-jwt" } },
      { ACCESS_TEAM_DOMAIN: "test-team" } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: "Invalid Access JWT" })
  })

  it("returns 401 for expired JWT", async () => {
    const header = btoa(JSON.stringify({ alg: "RS256", kid: "test-kid" }))
    const payload = btoa(
      JSON.stringify({
        email: "test@example.com",
        sub: "test-sub",
        iss: "test-iss",
        aud: ["test-aud"],
        exp: Math.floor(Date.now() / 1000) - 3600,
        iat: Math.floor(Date.now() / 1000) - 7200,
      }),
    )
    const fakeJwt = `${header}.${payload}.fake-signature`

    const app = createApp()
    const res = await app.request(
      "/test",
      { headers: { "CF-Access-JWT-Assertion": fakeJwt } },
      { ACCESS_TEAM_DOMAIN: "test-team" } as unknown as AppEnv["Bindings"],
    )
    expect(res.status).toBe(401)
  })
})
