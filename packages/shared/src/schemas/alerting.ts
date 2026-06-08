import * as z from 'zod/mini';

export const labelMatchOperator = z.enum(['=', '!=', '=~', '!~']);
export type LabelMatchOperator = z.infer<typeof labelMatchOperator>;

export const labelMatcherSchema = z.object({
  name: z.string().check(z.minLength(1), z.maxLength(256)),
  operator: labelMatchOperator,
  value: z.string().check(z.maxLength(1024)),
});
export type LabelMatcher = z.infer<typeof labelMatcherSchema>;

export const labelsMapSchema = z._default(z.record(z.string(), z.string()), {});
export type LabelsMap = z.infer<typeof labelsMapSchema>;

export const conditionReducer = z.enum(['last', 'avg', 'min', 'max', 'sum', 'count']);
export type ConditionReducer = z.infer<typeof conditionReducer>;

export const conditionOperator = z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq']);
export type ConditionOperator = z.infer<typeof conditionOperator>;

export const alertConditionSchema = z.object({
  refId: z.string().check(z.minLength(1), z.maxLength(8)),
  reducer: conditionReducer,
  operator: conditionOperator,
  threshold: z.number(),
});
export type AlertCondition = z.infer<typeof alertConditionSchema>;

export const alertQuerySchema = z.object({
  refId: z.string().check(z.minLength(1), z.maxLength(8)),
  datasourceId: z.uuid(),
  expr: z.string().check(z.minLength(1), z.maxLength(8192)),
  legendFormat: z._default(z.string().check(z.maxLength(256)), ''),
});
export type AlertQuery = z.infer<typeof alertQuerySchema>;

export const noDataState = z.enum(['Alerting', 'OK', 'KeepLastState']);
export type NoDataState = z.infer<typeof noDataState>;

export const execErrState = z.enum(['Alerting', 'KeepLastState']);
export type ExecErrState = z.infer<typeof execErrState>;

export const alertInstanceState = z.enum(['Normal', 'Pending', 'Firing', 'Resolved']);
export type AlertInstanceState = z.infer<typeof alertInstanceState>;

export const contactPointType = z.enum(['email', 'webhook', 'slack', 'discord']);
export type ContactPointType = z.infer<typeof contactPointType>;

const emailContactSettings = z.object({
  type: z.literal('email'),
  addresses: z.array(z.string().check(z.minLength(1), z.maxLength(320))).check(z.minLength(1), z.maxLength(50)),
});

const webhookContactSettings = z.object({
  type: z.literal('webhook'),
  url: z.url().check(z.maxLength(2048)),
  method: z._default(z.enum(['POST', 'PUT']), 'POST'),
  username: z._default(z.string().check(z.maxLength(256)), ''),
  password: z._default(z.string().check(z.maxLength(1024)), ''),
});

// webhookUrl is the secret: it holds AES ciphertext at rest and must round-trip the
// '******' redaction sentinel on edit, so it is a plain bounded string (not z.url()).
// URL-shape validation belongs at the form layer, where the value is always cleartext.
const slackContactSettings = z.object({
  type: z.literal('slack'),
  webhookUrl: z.string().check(z.maxLength(2048)),
  channel: z._default(z.string().check(z.maxLength(256)), ''),
  username: z._default(z.string().check(z.maxLength(256)), ''),
});

const discordContactSettings = z.object({
  type: z.literal('discord'),
  webhookUrl: z.string().check(z.maxLength(2048)),
  username: z._default(z.string().check(z.maxLength(256)), ''),
  avatarUrl: z._default(z.string().check(z.maxLength(2048)), ''),
});

export const contactPointSettingsSchema = z.union([emailContactSettings, webhookContactSettings, slackContactSettings, discordContactSettings]);
export type ContactPointSettings = z.infer<typeof contactPointSettingsSchema>;

export const muteTimeIntervalSchema = z.object({
  weekdays: z._default(z.array(z.int().check(z.minimum(0), z.maximum(6))), []),
  startTime: z._default(z.string().check(z.regex(/^\d{2}:\d{2}$/)), '00:00'),
  endTime: z._default(z.string().check(z.regex(/^\d{2}:\d{2}$/)), '24:00'),
  months: z._default(z.array(z.int().check(z.minimum(1), z.maximum(12))), []),
  timezone: z._default(z.string().check(z.maxLength(64)), 'UTC'),
});
export type MuteTimeInterval = z.infer<typeof muteTimeIntervalSchema>;

// Array forms, prebuilt here so non-zod packages (the API worker) can `.parse()` JSON columns.
export const labelMatchersSchema = z.array(labelMatcherSchema);
export const muteTimeIntervalsSchema = z.array(muteTimeIntervalSchema);
export const stringListSchema = z.array(z.string());
