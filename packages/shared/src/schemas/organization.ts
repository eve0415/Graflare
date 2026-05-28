import { z } from "zod"

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type Organization = z.infer<typeof organizationSchema>
