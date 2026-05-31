import * as z from 'zod/mini';

export const thresholdSchema = z.object({
  value: z.number(),
  color: z.string().check(z.minLength(1), z.maxLength(64)),
});

export type Threshold = z.infer<typeof thresholdSchema>;

export const thresholdsSchema = z.array(thresholdSchema);

export type Thresholds = z.infer<typeof thresholdsSchema>;
