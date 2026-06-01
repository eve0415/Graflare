import { prometheusResponseSchema } from '@graflare/shared/schemas/prometheus';
import { proxyQueryInputSchema } from '@graflare/shared/schemas/proxy';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

export const proxyQuery = createServerFn({ method: 'POST' })
  .inputValidator(proxyQueryInputSchema)
  .handler(async ({ data }) => {
    const result = await env.API.proxyQuery('default', data.datasourceId, data.endpoint, data.params);
    return prometheusResponseSchema.parse(result);
  });
