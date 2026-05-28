import { describe, expect, it } from "vitest"
import { PrometheusClient } from "./client"

describe("PrometheusClient", () => {
  it("creates with correct config", () => {
    const client = new PrometheusClient(
      "https://prom.example.com",
      { type: "bearer", credentials: { token: "test" } },
      30000,
    )
    expect(client).toBeDefined()
  })

  it("handles non-existent host gracefully", async () => {
    const client = new PrometheusClient(
      "http://localhost:1",
      { type: "none" },
      1000,
    )
    const result = await client.instantQuery("up")
    expect(result.status).toBe("error")
  })
})
