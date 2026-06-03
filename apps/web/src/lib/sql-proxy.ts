import { sqlQueryInputSchema } from '@graflare/shared/schemas/sql';
import { sqlResponseSchema } from '@graflare/shared/schemas/sql';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

import { getAccessJwt } from './auth';

export const sqlQuery = createServerFn({ method: 'POST' })
  .inputValidator(sqlQueryInputSchema)
  .handler(async ({ data }) => {
    const result = await env.API.sqlQuery(getAccessJwt(), data.datasourceId, data.rawSql, data.format, data.timeRange);
    return sqlResponseSchema.parse(result);
  });
