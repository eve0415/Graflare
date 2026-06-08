import * as z from 'zod/mini';

export const refreshIntervalSchema = z.nullable(z.enum(['5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h']));

export type RefreshInterval = z.infer<typeof refreshIntervalSchema>;

export const timeRangeSchema = z.object({
  from: z.string().check(z.minLength(1), z.maxLength(128)),
  to: z.string().check(z.minLength(1), z.maxLength(128)),
  refresh: z._default(refreshIntervalSchema, null),
});

export type TimeRange = z.infer<typeof timeRangeSchema>;
