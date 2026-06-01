import * as z from 'zod/mini';

export const alertRuleGroupSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  folderId: z.nullable(z.uuid()),
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  evalIntervalS: z._default(z.int().check(z.minimum(10), z.maximum(86400)), 60),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type AlertRuleGroup = z.infer<typeof alertRuleGroupSchema>;

export const createAlertRuleGroupSchema = z.object({
  folderId: z._default(z.nullable(z.uuid()), null),
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  evalIntervalS: z._default(z.int().check(z.minimum(10), z.maximum(86400)), 60),
});

export type CreateAlertRuleGroup = z.infer<typeof createAlertRuleGroupSchema>;

export const updateAlertRuleGroupSchema = z.partial(createAlertRuleGroupSchema);
export type UpdateAlertRuleGroup = z.infer<typeof updateAlertRuleGroupSchema>;

export const alertRuleGroupIdParamSchema = z.object({ id: z.uuid() });

export const updateAlertRuleGroupInputSchema = z.object({
  id: z.uuid(),
  data: updateAlertRuleGroupSchema,
});
export type UpdateAlertRuleGroupInput = z.infer<typeof updateAlertRuleGroupInputSchema>;
