import * as z from 'zod/mini';

import { alertInstanceState, labelsMapSchema } from './alerting';

export const alertInstanceSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  ruleId: z.uuid(),
  labelsHash: z.string().check(z.minLength(1), z.maxLength(128)),
  labels: labelsMapSchema,
  state: z._default(alertInstanceState, 'Normal'),
  value: z.string(),
  activeAt: z.nullable(z.int()),
  lastEvalAt: z.int(),
});

export type AlertInstance = z.infer<typeof alertInstanceSchema>;

export const upsertAlertInstanceSchema = z.object({
  ruleId: z.uuid(),
  labelsHash: z.string().check(z.minLength(1), z.maxLength(128)),
  labels: labelsMapSchema,
  state: alertInstanceState,
  value: z.string(),
  activeAt: z.nullable(z.int()),
  lastEvalAt: z.int(),
});

export type UpsertAlertInstance = z.infer<typeof upsertAlertInstanceSchema>;

export const alertInstanceListQuerySchema = z.object({
  ruleId: z.optional(z.uuid()),
  state: z.optional(alertInstanceState),
});

export type AlertInstanceListQuery = z.infer<typeof alertInstanceListQuerySchema>;
