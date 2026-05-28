import { Hono } from "hono"
import { WorkerEntrypoint } from "cloudflare:workers"

type Bindings = {
  DB: D1Database
  ENCRYPTION_KEY: string
  ACCESS_TEAM_DOMAIN: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: {
    user: { email: string; name: string }
    orgId: string
  }
}

const app = new Hono<AppEnv>()

app.get("/health", (c) => c.json({ status: "ok" }))

export default app

export class GraflareAPI extends WorkerEntrypoint<Bindings> {
  async health(): Promise<{ status: string }> {
    return { status: "ok" }
  }
}
