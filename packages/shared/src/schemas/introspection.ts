import * as z from 'zod/mini';

import { datasourceIdSchema } from './ids';

// ── SQL introspection ──────────────────────────────────────────────

export const listTablesInputSchema = z.object({
	datasourceId: datasourceIdSchema,
});
export type ListTablesInput = z.infer<typeof listTablesInputSchema>;

export const tableInfoSchema = z.object({
	name: z.string(),
	schema: z.optional(z.string()),
});
export type TableInfo = z.infer<typeof tableInfoSchema>;

export const listTablesResponseSchema = z.object({
	tables: z.array(tableInfoSchema),
	error: z.optional(z.string()),
});
export type ListTablesResponse = z.infer<typeof listTablesResponseSchema>;

export const describeTableInputSchema = z.object({
	datasourceId: datasourceIdSchema,
	tableName: z.string().check(z.minLength(1), z.maxLength(256)),
	schema: z.optional(z.string().check(z.maxLength(256))),
});
export type DescribeTableInput = z.infer<typeof describeTableInputSchema>;

export const columnInfoSchema = z.object({
	name: z.string(),
	type: z.string(),
	nullable: z.boolean(),
});
export type ColumnInfo = z.infer<typeof columnInfoSchema>;

export const describeTableResponseSchema = z.object({
	columns: z.array(columnInfoSchema),
	error: z.optional(z.string()),
});
export type DescribeTableResponse = z.infer<typeof describeTableResponseSchema>;

export const describeDatabaseInputSchema = z.object({
	datasourceId: datasourceIdSchema,
});
export type DescribeDatabaseInput = z.infer<typeof describeDatabaseInputSchema>;

export const describeDatabaseResponseSchema = z.object({
	tables: z.record(z.string(), z.array(columnInfoSchema)),
	error: z.optional(z.string()),
});
export type DescribeDatabaseResponse = z.infer<typeof describeDatabaseResponseSchema>;

// ── Prometheus introspection ───────────────────────────────────────

export const listMetricsInputSchema = z.object({
	datasourceId: datasourceIdSchema,
});
export type ListMetricsInput = z.infer<typeof listMetricsInputSchema>;

export const listMetricsResponseSchema = z.object({
	metrics: z.array(z.string()),
	error: z.optional(z.string()),
});
export type ListMetricsResponse = z.infer<typeof listMetricsResponseSchema>;

export const listLabelsInputSchema = z.object({
	datasourceId: datasourceIdSchema,
	metric: z.optional(z.string().check(z.maxLength(512))),
});
export type ListLabelsInput = z.infer<typeof listLabelsInputSchema>;

export const listLabelsResponseSchema = z.object({
	labels: z.array(z.string()),
	error: z.optional(z.string()),
});
export type ListLabelsResponse = z.infer<typeof listLabelsResponseSchema>;

export const listLabelValuesInputSchema = z.object({
	datasourceId: datasourceIdSchema,
	label: z.string().check(z.minLength(1), z.maxLength(256)),
	metric: z.optional(z.string().check(z.maxLength(512))),
});
export type ListLabelValuesInput = z.infer<typeof listLabelValuesInputSchema>;

export const listLabelValuesResponseSchema = z.object({
	values: z.array(z.string()),
	error: z.optional(z.string()),
});
export type ListLabelValuesResponse = z.infer<typeof listLabelValuesResponseSchema>;
