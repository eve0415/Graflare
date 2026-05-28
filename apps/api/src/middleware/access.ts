import type { Context, MiddlewareHandler } from "hono"
import type { AppEnv } from "../index"

interface AccessJwtPayload {
  email: string
  name?: string
  sub: string
  iss: string
  aud: string[]
  exp: number
  iat: number
}

interface JwkKey {
  kid: string
  kty: string
  n: string
  e: string
  alg: string
  use: string
}

interface CertsResponse {
  keys: JwkKey[]
  public_cert: { kid: string; cert: string }[]
  public_certs: { kid: string; cert: string }[]
}

let cachedKeys: { keys: Map<string, CryptoKey>; expiresAt: number } | null =
  null

async function getPublicKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  if (cachedKeys && Date.now() < cachedKeys.expiresAt) {
    return cachedKeys.keys
  }

  const res = await fetch(
    `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`,
  )
  if (!res.ok) {
    throw new Error(`Failed to fetch Access certs: ${res.status}`)
  }

  const data = (await res.json()) as CertsResponse
  const keys = new Map<string, CryptoKey>()

  for (const jwk of data.keys) {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    )
    keys.set(jwk.kid, key)
  }

  cachedKeys = { keys, expiresAt: Date.now() + 5 * 60 * 1000 }
  return keys
}

function decodeJwtPayload(token: string): { header: { kid: string; alg: string }; payload: AccessJwtPayload } {
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format")
  }

  const header = JSON.parse(atob(parts[0]!.replace(/-/g, "+").replace(/_/g, "/")))
  const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")))

  return { header, payload }
}

async function verifyJwt(
  token: string,
  teamDomain: string,
): Promise<AccessJwtPayload> {
  const { header, payload } = decodeJwtPayload(token)

  if (payload.exp < Date.now() / 1000) {
    throw new Error("Token expired")
  }

  const keys = await getPublicKeys(teamDomain)
  const key = keys.get(header.kid)
  if (!key) {
    throw new Error("Unknown signing key")
  }

  const parts = token.split(".")
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature = Uint8Array.from(
    atob(parts[2]!.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  )

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    data,
  )

  if (!valid) {
    throw new Error("Invalid signature")
  }

  return payload
}

export function accessMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next) => {
    const jwt = c.req.header("CF-Access-JWT-Assertion")
    if (!jwt) {
      return c.json({ error: "Missing Access JWT" }, 401)
    }

    try {
      const payload = await verifyJwt(jwt, c.env.ACCESS_TEAM_DOMAIN)
      c.set("user", {
        email: payload.email,
        name: payload.name ?? payload.email,
      })
    } catch {
      return c.json({ error: "Invalid Access JWT" }, 401)
    }

    await next()
  }
}
