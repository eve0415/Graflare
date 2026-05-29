import * as z from 'zod/mini';

import { datasourceIdSchema } from './ids';

// Presence/type/length checks only — NO semantic PromQL validation.
const promQL = z.string().check(z.minLength(1), z.maxLength(8192));

// Prometheus time/start/end accept unix seconds, scientific notation (1.5e9),
// AND RFC3339 timestamps (2026-05-29T00:00:00Z). Do NOT regex to digits-only —
// that rejects valid input. Bound length, don't constrain format.
const timeParam = z.string().check(z.minLength(1), z.maxLength(64));
const stepParam = z.string().check(z.minLength(1), z.maxLength(64));

export const datasourceIdParamSchema = z.object({ id: datasourceIdSchema });

export const labelNameParamSchema = z.object({
  id: datasourceIdSchema,
  name: z.string().check(z.minLength(1), z.maxLength(256)),
});

export const instantQueryBodySchema = z.object({
  query: promQL,
  time: z.optional(timeParam),
});

export const rangeQueryBodySchema = z.object({
  query: promQL,
  start: timeParam,
  end: timeParam,
  step: stepParam,
});

export const labelsQuerySchema = z.object({
  'match[]': z.optional(z.array(z.string().check(z.maxLength(8192)))),
});

// Shape of the proxy params bag (RPC arg + web proxy input).
export const proxyParamsSchema = z.record(z.string(), z.string());

// Composite web server-fn input so apps/web imports a schema and needs no
// direct zod dependency.
export const proxyQueryInputSchema = z.object({
  datasourceId: datasourceIdSchema,
  endpoint: z.string().check(z.minLength(1), z.maxLength(256)),
  params: proxyParamsSchema,
});

export type ProxyQueryInput = z.infer<typeof proxyQueryInputSchema>;
