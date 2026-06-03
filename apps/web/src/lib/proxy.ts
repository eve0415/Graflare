import { prometheusResponseSchema } from '@graflare/shared/schemas/prometheus';
import { proxyQueryInputSchema } from '@graflare/shared/schemas/proxy';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

import { getAccessJwt } from './auth';

export const proxyQuery = createServerFn({ method: 'POST' })
  .inputValidator(proxyQueryInputSchema)
  .handler(async ({ data }) => {
    const result = await env.API.proxyQuery(getAccessJwt(), data.datasourceId, data.endpoint, data.params);
    return prometheusResponseSchema.parse(result);
  });
