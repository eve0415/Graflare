import { z } from "zod"

export const prometheusResponseSchema = z.object({
  status: z.enum(["success", "error"]),
  data: z.unknown().optional(),
  errorType: z.string().optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})

export type PrometheusResponse = z.infer<typeof prometheusResponseSchema>
