import type { CreateServiceToken, ServiceToken, ServiceTokenWithSecret } from '@graflare/shared/schemas/service-token';

import { serviceTokenListSchema, serviceTokenWithSecretSchema } from '@graflare/shared/schemas/service-token';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Credentials for the Cloudflare API. `apiToken` is a secret and must never be
 * logged or surfaced in errors.
 */
export interface CloudflareApiAuth {
  apiToken: string;
  accountId: string;
}

interface CloudflareApiMessage {
  code: number;
  message: string;
}

/**
 * Thrown when the Cloudflare API returns a non-2xx status or `success: false`.
 * Carries the HTTP status and Cloudflare's structured error list (codes +
 * messages) — but deliberately never the request body, api token, or any secret.
 */
export class CloudflareApiError extends Error {
  readonly status: number;
  readonly errors: CloudflareApiMessage[];

  constructor(status: number, errors: CloudflareApiMessage[], operation: string) {
    const detail = errors.length > 0 ? errors.map(e => `${String(e.code)}: ${e.message}`).join('; ') : `HTTP ${String(status)}`;
    super(`Cloudflare API ${operation} failed (${detail})`);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.errors = errors;
  }
}

const isCloudflareMessage = (value: unknown): value is CloudflareApiMessage =>
  typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'number' && 'message' in value && typeof value.message === 'string';

const parseErrors = (value: unknown): CloudflareApiMessage[] => {
  if (typeof value !== 'object' || value === null || !('errors' in value) || !Array.isArray(value.errors)) {
    return [];
  }
  return value.errors.filter(isCloudflareMessage);
};

const isSuccessEnvelope = (value: unknown): value is { success: true; result: unknown } =>
  typeof value === 'object' && value !== null && 'success' in value && value.success === true;

/**
 * Performs a Cloudflare API request, enforces the `{ success, errors, result }`
 * envelope contract, and returns the raw (still-untrusted) `result` for the
 * caller to zod-validate. Throws {@link CloudflareApiError} on non-2xx or
 * `success: false`.
 */
const cfRequest = async (auth: CloudflareApiAuth, path: string, init: RequestInit, operation: string): Promise<unknown> => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${auth.apiToken}`);
  if (init.body !== undefined && init.body !== null) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${CF_API_BASE}/accounts/${auth.accountId}/access/service_tokens${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok || !isSuccessEnvelope(json)) {
    throw new CloudflareApiError(res.status, parseErrors(json), operation);
  }

  return json.result;
};

/**
 * Creates a Cloudflare Access service token. The returned `client_secret` is
 * shown by Cloudflare ONLY here (and on rotate) — the caller must persist
 * everything except the secret and surface the secret to the user exactly once.
 */
export const createServiceToken = async (auth: CloudflareApiAuth, input: CreateServiceToken): Promise<ServiceTokenWithSecret> => {
  const body: { name: string; duration?: string } = { name: input.name };
  if (input.duration !== undefined) {
    body.duration = input.duration;
  }

  const result = await cfRequest(auth, '', { method: 'POST', body: JSON.stringify(body) }, 'create service token');
  return serviceTokenWithSecretSchema.parse(result);
};

/** Lists the account's Access service tokens. The secret is never included. */
export const listServiceTokens = async (auth: CloudflareApiAuth): Promise<ServiceToken[]> => {
  const result = await cfRequest(auth, '', { method: 'GET' }, 'list service tokens');
  return serviceTokenListSchema.parse(result);
};

/** Deletes (revokes) a Cloudflare Access service token by its Cloudflare id. */
export const deleteServiceToken = async (auth: CloudflareApiAuth, cfTokenId: string): Promise<void> => {
  await cfRequest(auth, `/${encodeURIComponent(cfTokenId)}`, { method: 'DELETE' }, 'delete service token');
};

/**
 * The service-token operations bound to a single set of credentials. This is the
 * seam the RPC/HTTP layer depends on, so tests can substitute a fake without
 * touching the network.
 */
export interface ServiceTokenClient {
  create(input: CreateServiceToken): Promise<ServiceTokenWithSecret>;
  list(): Promise<ServiceToken[]>;
  delete(cfTokenId: string): Promise<void>;
}

export const createServiceTokenClient = (auth: CloudflareApiAuth): ServiceTokenClient => ({
  create: input => createServiceToken(auth, input),
  list: () => listServiceTokens(auth),
  delete: cfTokenId => deleteServiceToken(auth, cfTokenId),
});
