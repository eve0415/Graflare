---
paths:
  - 'apps/api/src/middleware/**'
  - 'apps/api/src/routes/proxy.ts'
  - 'apps/api/src/crypto/**'
  - 'apps/api/src/index.ts'
---

# Security invariants (apps/api)

Must-hold rules for auth, the query proxy, and credentials — each was flagged by automated
security review, so regressing any of them gets re-flagged. Verify they still hold before
merging changes to auth middleware, the query proxy, the proxy RPC in `index.ts`, or crypto.

- **Cloudflare Access JWT — validate signature AND `iss` AND `aud`, not just `exp`.** Verify the
  RS256 signature against the team certs, then require `iss === https://<team>.cloudflareaccess.com`
  and `aud` to include the app's AUD tag (`ACCESS_AUD`). Exp-only validation lets a valid token
  from _another_ Access app through. (Why: cross-app token replay → auth bypass.)

- **Tenant/org IDs must use a cryptographic hash (≥128 bits) or an explicit membership row —
  never a short non-crypto hash.** Org ID derives from the user email via SHA-256 (truncated to
  128 bits). A short FNV-style hash collides and maps two users to one org. (Why: collision →
  cross-tenant data exposure.)

- **Query proxy: allowlist the endpoint and treat it as a path only.** `proxyQuery` must reject
  any `endpoint` outside the allowlist (`/api/v1/query`, `/api/v1/query_range`, `/api/v1/labels`,
  `/api/v1/series`, `/api/v1/label/*/values`), build the URL by setting the **path** on the
  datasource origin, and assert
  `new URL(target).origin === new URL(ds.url).origin` **before** attaching credentials and
  fetching. (Why: an attacker-controlled endpoint that changes host = SSRF + credential
  exfiltration to an arbitrary server.)

- **Never expose decrypted credentials.** Credentials are AES-256-GCM encrypted at rest (key =
  `ENCRYPTION_KEY` secret, random 12-byte IV per encrypt, stored as base64(iv‖ciphertext‖tag)).
  Decrypted credentials are used only to build the upstream `Authorization` header — never
  returned in any HTTP/RPC response and never logged. The datasource read paths explicitly
  select columns to omit the `credentials` field from responses. (Why: credential leak.)
