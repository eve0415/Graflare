import * as z from 'zod/mini';

// --- Create input (client → API) ---

// Cloudflare's `duration` is a Go-style duration string (e.g. `8760h`, `2h45m`,
// `300ms`). We bound it loosely here and let Cloudflare be the source of truth on
// the exact grammar; an empty/oversized value is rejected up front.
const durationSchema = z.string().check(z.regex(/^[0-9]+(ns|us|µs|ms|s|m|h)([0-9]+(ns|us|µs|ms|s|m|h))*$/), z.maxLength(64));

export const createServiceTokenSchema = z.object({
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  // Optional validity period. Cloudflare defaults to one year (`8760h`) when omitted.
  duration: z.optional(durationSchema),
});

export type CreateServiceToken = z.infer<typeof createServiceTokenSchema>;

// --- Cloudflare API `result` shapes (untrusted boundary — validate before use) ---

// Fields common to every service-token representation Cloudflare returns. The
// secret is deliberately NOT here; it only exists on the create/rotate result.
const serviceTokenBase = {
  id: z.string().check(z.minLength(1)),
  client_id: z.string().check(z.minLength(1)),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  // `expires_at`/`duration` are documented as optional and may be absent on
  // some accounts/responses, so keep them optional rather than required.
  expires_at: z.optional(z.string()),
  duration: z.optional(z.string()),
};

// Create (and rotate) — the ONLY responses that carry `client_secret`.
export const serviceTokenWithSecretSchema = z.object({
  ...serviceTokenBase,
  client_secret: z.string().check(z.minLength(1)),
});

export type ServiceTokenWithSecret = z.infer<typeof serviceTokenWithSecretSchema>;

// List — never includes `client_secret`.
export const serviceTokenSchema = z.object(serviceTokenBase);

export type ServiceToken = z.infer<typeof serviceTokenSchema>;

export const serviceTokenListSchema = z.array(serviceTokenSchema);

// --- Graflare-side link metadata (what we persist + return; never a secret) ---

export const serviceTokenMetadataSchema = z.object({
  id: z.uuid(),
  clientId: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  createdAt: z.int(),
  expiresAt: z.nullable(z.int()),
});

export type ServiceTokenMetadata = z.infer<typeof serviceTokenMetadataSchema>;

// Create result returned to the caller: metadata + the secret, exactly once.
export type ServiceTokenCreateResult = ServiceTokenMetadata & { clientSecret: string };

export const serviceTokenIdParamSchema = z.object({ id: z.uuid() });
