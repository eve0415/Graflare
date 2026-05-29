import { z } from 'zod';

// A single Prometheus sample: [unix timestamp, value-as-string].
export const prometheusSampleSchema = z.tuple([z.number(), z.string()]);

// Label set, e.g. { __name__: "up", job: "api" }.
export const prometheusMetricSchema = z.record(z.string(), z.string());

export const prometheusVectorResultSchema = z.object({
  metric: prometheusMetricSchema,
  value: prometheusSampleSchema,
});

export const prometheusMatrixResultSchema = z.object({
  metric: prometheusMetricSchema,
  values: z.array(prometheusSampleSchema),
});

// query / query_range responses: `result` shape depends on `resultType`.
export const prometheusQueryDataSchema = z.object({
  resultType: z.enum(['matrix', 'vector', 'scalar', 'string']),
  result: z.union([z.array(prometheusVectorResultSchema), z.array(prometheusMatrixResultSchema), prometheusSampleSchema]),
});

// `data` covers every endpoint the proxy allowlists. Modelled concretely
// (bounded depth, no recursion) so the response stays serializable across the
// Worker RPC boundary — a recursive JSON type breaks createServerFn's
// serialization type-check.
//   - query / query_range → { resultType, result }
//   - labels, label/*/values → string[]
//   - series → array of label sets
export const prometheusDataSchema = z.union([prometheusQueryDataSchema, z.array(z.string()), z.array(prometheusMetricSchema)]);

export const prometheusResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  data: prometheusDataSchema.optional(),
  errorType: z.string().optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export type PrometheusQueryData = z.infer<typeof prometheusQueryDataSchema>;
export type PrometheusData = z.infer<typeof prometheusDataSchema>;
export type PrometheusResponse = z.infer<typeof prometheusResponseSchema>;
