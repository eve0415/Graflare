import { exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

describe("health check", () => {
  it("returns ok", async () => {
    const response = await exports.default.fetch("http://localhost/health")
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ status: "ok" })
  })
})
