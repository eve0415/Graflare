import * as z from 'zod/mini';

import { labelMatcherSchema } from './alerting';

export const silenceSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  matchers: z.array(labelMatcherSchema).check(z.minLength(1)),
  startsAt: z.int(),
  endsAt: z.int(),
  comment: z._default(z.string().check(z.maxLength(4096)), ''),
  createdBy: z._default(z.string().check(z.maxLength(255)), ''),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type Silence = z.infer<typeof silenceSchema>;

export const createSilenceSchema = z.object({
  matchers: z.array(labelMatcherSchema).check(z.minLength(1)),
  startsAt: z.int(),
  endsAt: z.int(),
  comment: z._default(z.string().check(z.maxLength(4096)), ''),
  createdBy: z._default(z.string().check(z.maxLength(255)), ''),
});

export type CreateSilence = z.infer<typeof createSilenceSchema>;

export const updateSilenceSchema = z.partial(createSilenceSchema);
export type UpdateSilence = z.infer<typeof updateSilenceSchema>;

export const silenceIdParamSchema = z.object({ id: z.uuid() });

export const updateSilenceInputSchema = z.object({
  id: z.uuid(),
  data: updateSilenceSchema,
});
export type UpdateSilenceInput = z.infer<typeof updateSilenceInputSchema>;
