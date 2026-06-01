import * as z from 'zod/mini';

import { contactPointSettingsSchema, contactPointType } from './alerting';

export const contactPointSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  type: contactPointType,
  settings: contactPointSettingsSchema,
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type ContactPoint = z.infer<typeof contactPointSchema>;

export const createContactPointSchema = z.object({
  name: z.string().check(z.minLength(1), z.maxLength(255)),
  type: contactPointType,
  settings: contactPointSettingsSchema,
});

export type CreateContactPoint = z.infer<typeof createContactPointSchema>;

export const updateContactPointSchema = z.partial(createContactPointSchema);
export type UpdateContactPoint = z.infer<typeof updateContactPointSchema>;

export const contactPointIdParamSchema = z.object({ id: z.uuid() });

export const updateContactPointInputSchema = z.object({
  id: z.uuid(),
  data: updateContactPointSchema,
});
export type UpdateContactPointInput = z.infer<typeof updateContactPointInputSchema>;
