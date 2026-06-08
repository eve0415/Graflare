import { createDatasourceSchema, testConnectionInlineSchema, updateDatasourceInputSchema as updateDatasourceInput } from '@graflare/shared/schemas/datasource';
import { datasourceIdSchema } from '@graflare/shared/schemas/ids';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

import { getAccessJwt } from '../../lib/auth';

export interface DatasourceRow {
  id: string;
  orgId: string;
  name: string;
  type: string;
  dialect: string | null;
  url: string;
  authType: string;
  queryTimeoutMs: number;
  cacheTtl: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

const toDatasourceRow = (ds: {
  id: string;
  orgId: string;
  name: string;
  type: string;
  dialect: string | null;
  url: string;
  authType: string;
  queryTimeoutMs: number;
  cacheTtl: number;
  createdAt: Date;
  updatedAt: Date;
}): DatasourceRow => ({
  id: ds.id,
  orgId: ds.orgId,
  name: ds.name,
  type: ds.type,
  dialect: ds.dialect,
  url: ds.url,
  authType: ds.authType,
  queryTimeoutMs: ds.queryTimeoutMs,
  cacheTtl: ds.cacheTtl,
  createdAt: ds.createdAt,
  updatedAt: ds.updatedAt,
});

export const listDatasources = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await env.API.listDatasources(getAccessJwt());
  return rows.map(ds => toDatasourceRow(ds));
});

export const getDatasource = createServerFn({ method: 'GET' })
  .inputValidator(datasourceIdSchema)
  .handler(async ({ data: id }) => {
    const ds = await env.API.getDatasource(getAccessJwt(), id);
    return ds === null ? null : toDatasourceRow(ds);
  });

export const createDatasource = createServerFn({ method: 'POST' })
  .inputValidator(createDatasourceSchema)
  .handler(async ({ data }) => {
    const ds = await env.API.createDatasource(getAccessJwt(), data);
    return {
      id: ds.id,
      orgId: ds.orgId,
      name: ds.name,
      type: ds.type,
      dialect: ds.dialect ?? null,
      url: ds.url,
      authType: ds.authType,
      queryTimeoutMs: ds.queryTimeoutMs,
      cacheTtl: ds.cacheTtl,
      createdAt: ds.createdAt,
      updatedAt: ds.updatedAt,
    };
  });

export const updateDatasource = createServerFn({ method: 'POST' })
  .inputValidator(updateDatasourceInput)
  .handler(async ({ data: { id, data } }) => {
    const ds = await env.API.updateDatasource(getAccessJwt(), id, data);
    return ds === null ? null : toDatasourceRow(ds);
  });

export const deleteDatasource = createServerFn({ method: 'POST' })
  .inputValidator(datasourceIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteDatasource(getAccessJwt(), id);
  });

export const testConnection = createServerFn({ method: 'POST' })
  .inputValidator(datasourceIdSchema)
  .handler(async ({ data: id }) => {
    const result = await env.API.testConnection(getAccessJwt(), id);
    const plain: TestConnectionResult = {
      success: result.success,
      latencyMs: result.latencyMs,
      ...(result.error !== undefined && { error: result.error }),
    };
    return plain;
  });

export const testConnectionInline = createServerFn({ method: 'POST' })
  .inputValidator(testConnectionInlineSchema)
  .handler(async ({ data }) => {
    const result = await env.API.testConnectionInline(getAccessJwt(), data);
    const plain: TestConnectionResult = {
      success: result.success,
      latencyMs: result.latencyMs,
      ...(result.error !== undefined && { error: result.error }),
    };
    return plain;
  });
