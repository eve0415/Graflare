import * as z from 'zod/mini';

export const variableTypeSchema = z.enum(['query', 'custom', 'constant']);

export type VariableType = z.infer<typeof variableTypeSchema>;

export const variableSortSchema = z.enum([
  'disabled',
  'alphabetical-asc',
  'alphabetical-desc',
  'numerical-asc',
  'numerical-desc',
]);

export type VariableSort = z.infer<typeof variableSortSchema>;

export const variableSchema = z.object({
  name: z.string().check(z.minLength(1), z.maxLength(128)),
  type: variableTypeSchema,
  label: z._default(z.string().check(z.maxLength(255)), ''),
  datasourceId: z.optional(z.uuid()),
  query: z._default(z.string().check(z.maxLength(8192)), ''),
  regex: z._default(z.string().check(z.maxLength(2048)), ''),
  sort: z._default(variableSortSchema, 'disabled'),
  multi: z._default(z.boolean(), false),
  includeAll: z._default(z.boolean(), false),
  current: z._default(z.string(), ''),
  options: z._default(z.array(z.string()), []),
});

export type Variable = z.infer<typeof variableSchema>;
