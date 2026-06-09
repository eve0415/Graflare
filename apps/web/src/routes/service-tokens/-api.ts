import type { ServiceTokenCreateResult, ServiceTokenMetadata } from '@graflare/shared/schemas/service-token';

import { createServiceTokenSchema, serviceTokenIdParamSchema } from '@graflare/shared/schemas/service-token';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

import { getAccessJwt } from '../../lib/auth';

// RPC return values are branded (`[Symbol.dispose]`) and rejected by createServerFn's
// serialization check, and spreading does NOT drop the brand — so each value is rebuilt
// field by field into a plain object (mirrors `toDatasourceRow`). The `clientSecret` is
// surfaced ONCE by `createServiceToken` and is never persisted anywhere.
const toServiceTokenRow = (token: ServiceTokenMetadata): ServiceTokenMetadata => ({
  id: token.id,
  clientId: token.clientId,
  name: token.name,
  createdAt: token.createdAt,
  expiresAt: token.expiresAt,
});

export const listServiceTokens = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await env.API.listServiceTokens(getAccessJwt());
  return rows.map(token => toServiceTokenRow(token));
});

export const createServiceToken = createServerFn({ method: 'POST' })
  .inputValidator(createServiceTokenSchema)
  .handler(async ({ data }): Promise<ServiceTokenCreateResult> => {
    const created = await env.API.createServiceToken(getAccessJwt(), data);
    return {
      id: created.id,
      clientId: created.clientId,
      name: created.name,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
      clientSecret: created.clientSecret,
    };
  });

export const revokeServiceToken = createServerFn({ method: 'POST' })
  .inputValidator(serviceTokenIdParamSchema)
  .handler(async ({ data }) => {
    await env.API.revokeServiceToken(getAccessJwt(), data.id);
  });
