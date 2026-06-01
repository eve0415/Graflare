import * as z from 'zod/mini';

import { alertConditionSchema, alertQuerySchema, execErrState, labelsMapSchema, noDataState } from './alerting';

export const alertRuleSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  groupId: z.uuid(),
  title: z.string().check(z.minLength(1), z.maxLength(512)),
  queries: z.array(alertQuerySchema).check(z.minLength(1)),
  condition: alertConditionSchema,
  labels: labelsMapSchema,
  annotations: z._default(z.record(z.string(), z.string()), {}),
  forDurationS: z._default(z.int().check(z.minimum(0), z.maximum(86400)), 0),
  noDataState: z._default(noDataState, 'Alerting'),
  execErrState: z._default(execErrState, 'Alerting'),
  isPaused: z._default(z.boolean(), false),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type AlertRule = z.infer<typeof alertRuleSchema>;

export const createAlertRuleSchema = z.object({
  groupId: z.uuid(),
  title: z.string().check(z.minLength(1), z.maxLength(512)),
  queries: z.array(alertQuerySchema).check(z.minLength(1)),
  condition: alertConditionSchema,
  labels: z._default(labelsMapSchema, {}),
  annotations: z._default(z.record(z.string(), z.string()), {}),
  forDurationS: z._default(z.int().check(z.minimum(0), z.maximum(86400)), 0),
  noDataState: z._default(noDataState, 'Alerting'),
  execErrState: z._default(execErrState, 'Alerting'),
  isPaused: z._default(z.boolean(), false),
});

export type CreateAlertRule = z.infer<typeof createAlertRuleSchema>;

export const updateAlertRuleSchema = z.partial(createAlertRuleSchema);
export type UpdateAlertRule = z.infer<typeof updateAlertRuleSchema>;

export const alertRuleIdParamSchema = z.object({ id: z.uuid() });

export const updateAlertRuleInputSchema = z.object({
  id: z.uuid(),
  data: updateAlertRuleSchema,
});
export type UpdateAlertRuleInput = z.infer<typeof updateAlertRuleInputSchema>;
