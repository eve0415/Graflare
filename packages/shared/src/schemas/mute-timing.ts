import * as z from 'zod/mini';

import { muteTimeIntervalSchema } from './alerting';

export const muteTimingSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  intervals: z._default(z.array(muteTimeIntervalSchema), []),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type MuteTiming = z.infer<typeof muteTimingSchema>;

export const createMuteTimingSchema = z.object({
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  intervals: z._default(z.array(muteTimeIntervalSchema), []),
});

export type CreateMuteTiming = z.infer<typeof createMuteTimingSchema>;

export const updateMuteTimingSchema = z.partial(createMuteTimingSchema);
export type UpdateMuteTiming = z.infer<typeof updateMuteTimingSchema>;

export const muteTimingIdParamSchema = z.object({ id: z.uuid() });

export const updateMuteTimingInputSchema = z.object({
  id: z.uuid(),
  data: updateMuteTimingSchema,
});
export type UpdateMuteTimingInput = z.infer<typeof updateMuteTimingInputSchema>;
