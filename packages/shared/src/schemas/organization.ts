import * as z from 'zod/mini';

import { orgIdSchema } from './ids';

export const organizationSchema = z.object({
  id: orgIdSchema,
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type Organization = z.infer<typeof organizationSchema>;
