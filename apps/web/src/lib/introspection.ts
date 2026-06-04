import {
	describeDatabaseInputSchema,
	describeDatabaseResponseSchema,
	describeTableInputSchema,
	describeTableResponseSchema,
	listLabelValuesInputSchema,
	listLabelValuesResponseSchema,
	listLabelsInputSchema,
	listLabelsResponseSchema,
	listMetricsInputSchema,
	listMetricsResponseSchema,
	listTablesInputSchema,
	listTablesResponseSchema,
} from '@graflare/shared/schemas/introspection';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';

import { getAccessJwt } from './auth';

export const listTables = createServerFn({ method: 'GET' })
	.inputValidator(listTablesInputSchema)
	.handler(async ({ data }) => {
		const result = await env.API.listTables(getAccessJwt(), data.datasourceId);
		return listTablesResponseSchema.parse(result);
	});

export const describeTable = createServerFn({ method: 'GET' })
	.inputValidator(describeTableInputSchema)
	.handler(async ({ data }) => {
		const result = await env.API.describeTable(getAccessJwt(), data.datasourceId, data.tableName, data.schema);
		return describeTableResponseSchema.parse(result);
	});

export const describeDatabase = createServerFn({ method: 'GET' })
	.inputValidator(describeDatabaseInputSchema)
	.handler(async ({ data }) => {
		const result = await env.API.describeDatabase(getAccessJwt(), data.datasourceId);
		return describeDatabaseResponseSchema.parse(result);
	});

export const listMetrics = createServerFn({ method: 'GET' })
	.inputValidator(listMetricsInputSchema)
	.handler(async ({ data }) => {
		const result = await env.API.listMetrics(getAccessJwt(), data.datasourceId);
		return listMetricsResponseSchema.parse(result);
	});

export const listLabels = createServerFn({ method: 'GET' })
	.inputValidator(listLabelsInputSchema)
	.handler(async ({ data }) => {
		const result = await env.API.listLabels(getAccessJwt(), data.datasourceId, data.metric);
		return listLabelsResponseSchema.parse(result);
	});

export const listLabelValues = createServerFn({ method: 'GET' })
	.inputValidator(listLabelValuesInputSchema)
	.handler(async ({ data }) => {
		const result = await env.API.listLabelValues(getAccessJwt(), data.datasourceId, data.label, data.metric);
		return listLabelValuesResponseSchema.parse(result);
	});
