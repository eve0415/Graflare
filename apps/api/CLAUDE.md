# apps/api — Graflare API Worker

Hono + `WorkerEntrypoint` RPC over Drizzle/D1. The web Worker calls the `GraflareAPI` class
methods through the `API` service binding (internal — bypasses Cloudflare Access, no public HTTP
hop). Cloudflare Access guards public ingress; HTTP routes live under `/api/v1/*`, and the RPC
methods mirror those operations for the binding.
