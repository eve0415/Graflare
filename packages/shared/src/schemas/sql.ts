import * as z from 'zod/mini';

import { datasourceIdSchema } from './ids';

export const sqlColumnTypeSchema = z.enum(['number', 'string', 'time', 'boolean', 'null']);
export type SqlColumnType = z.infer<typeof sqlColumnTypeSchema>;

export const sqlColumnSchema = z.object({
	name: z.string(),
	type: z.optional(sqlColumnTypeSchema),
});
export type SqlColumn = z.infer<typeof sqlColumnSchema>;

export const sqlCellSchema = z.union([z.string(), z.number(), z.null()]);
export type SqlCell = z.infer<typeof sqlCellSchema>;

export const sqlResponseSchema = z.object({
	columns: z.array(sqlColumnSchema),
	rows: z.array(z.array(sqlCellSchema)),
	error: z.optional(z.string()),
});
export type SqlResponse = z.infer<typeof sqlResponseSchema>;

export const sqlFormatSchema = z.enum(['table', 'time_series']);
export type SqlFormat = z.infer<typeof sqlFormatSchema>;

export const sqlQueryInputSchema = z.object({
	datasourceId: datasourceIdSchema,
	rawSql: z.string().check(z.minLength(1), z.maxLength(65536)),
	format: z._default(sqlFormatSchema, 'table'),
	timeRange: z.optional(
		z.object({
			from: z.string(),
			to: z.string(),
		}),
	),
});
export type SqlQueryInput = z.infer<typeof sqlQueryInputSchema>;
