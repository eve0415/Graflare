import * as z from 'zod/mini';

import { alertInstanceState } from './alerting';

export const annotationSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  dashboardId: z.optional(z.uuid()),
  panelId: z.optional(z.string()),
  alertRuleId: z.optional(z.uuid()),
  time: z.int(),
  timeEnd: z.optional(z.int()),
  text: z.string().check(z.maxLength(4096)),
  tags: z._default(z.array(z.string().check(z.maxLength(64))), []),
  prevState: z.optional(alertInstanceState),
  newState: z.optional(alertInstanceState),
  createdAt: z.int(),
});

export type Annotation = z.infer<typeof annotationSchema>;

export const createAnnotationSchema = z.object({
  dashboardId: z.optional(z.uuid()),
  panelId: z.optional(z.string()),
  alertRuleId: z.optional(z.uuid()),
  time: z.int(),
  timeEnd: z.optional(z.int()),
  text: z.string().check(z.maxLength(4096)),
  tags: z._default(z.array(z.string().check(z.maxLength(64))), []),
  prevState: z.optional(alertInstanceState),
  newState: z.optional(alertInstanceState),
});

export type CreateAnnotation = z.infer<typeof createAnnotationSchema>;

export const annotationIdParamSchema = z.object({ id: z.uuid() });

export const annotationListQuerySchema = z.object({
  dashboardId: z.optional(z.uuid()),
  alertRuleId: z.optional(z.uuid()),
  from: z.optional(z.int()),
  to: z.optional(z.int()),
  tag: z.optional(z.string()),
});

export type AnnotationListQuery = z.infer<typeof annotationListQuerySchema>;
