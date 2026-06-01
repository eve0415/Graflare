import * as z from 'zod/mini';

import { labelMatcherSchema } from './alerting';

export const notificationPolicySchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  parentId: z.nullable(z.uuid()),
  contactPointId: z.nullable(z.uuid()),
  groupBy: z._default(z.array(z.string().check(z.maxLength(128))), ['alertname']),
  matchers: z._default(z.array(labelMatcherSchema), []),
  muteTimingIds: z._default(z.array(z.uuid()), []),
  groupWaitS: z._default(z.int().check(z.minimum(0), z.maximum(86400)), 30),
  groupIntervalS: z._default(z.int().check(z.minimum(0), z.maximum(86400)), 300),
  repeatIntervalS: z._default(z.int().check(z.minimum(0), z.maximum(604800)), 14400),
  continueMatching: z._default(z.boolean(), false),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type NotificationPolicy = z.infer<typeof notificationPolicySchema>;

export const createNotificationPolicySchema = z.object({
  parentId: z._default(z.nullable(z.uuid()), null),
  contactPointId: z._default(z.nullable(z.uuid()), null),
  groupBy: z._default(z.array(z.string().check(z.maxLength(128))), ['alertname']),
  matchers: z._default(z.array(labelMatcherSchema), []),
  muteTimingIds: z._default(z.array(z.uuid()), []),
  groupWaitS: z._default(z.int().check(z.minimum(0), z.maximum(86400)), 30),
  groupIntervalS: z._default(z.int().check(z.minimum(0), z.maximum(86400)), 300),
  repeatIntervalS: z._default(z.int().check(z.minimum(0), z.maximum(604800)), 14400),
  continueMatching: z._default(z.boolean(), false),
});

export type CreateNotificationPolicy = z.infer<typeof createNotificationPolicySchema>;

export const updateNotificationPolicySchema = z.partial(createNotificationPolicySchema);
export type UpdateNotificationPolicy = z.infer<typeof updateNotificationPolicySchema>;

export const notificationPolicyIdParamSchema = z.object({ id: z.uuid() });

export const updateNotificationPolicyInputSchema = z.object({
  id: z.uuid(),
  data: updateNotificationPolicySchema,
});
export type UpdateNotificationPolicyInput = z.infer<typeof updateNotificationPolicyInputSchema>;
