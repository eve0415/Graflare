import * as z from 'zod/mini';

// Grafana value-mapping result: the text/color a matched value is rendered with.
// color is a hex string, matching the threshold color convention.
const mappingResult = z.object({
  text: z.optional(z.string().check(z.maxLength(512))),
  color: z.optional(z.string().check(z.maxLength(64))),
});

export type MappingResult = z.infer<typeof mappingResult>;

// Grafana value-mapping types. Modelled as a union of literal-tagged objects
// (same pattern as contactPointSettingsSchema in schemas/alerting.ts) so the set
// can grow with new mapping kinds without touching existing branches:
//   - value:   exact match on the string form of the value
//   - range:   numeric from..to, inclusive
//   - regex:   pattern test on the string form
//   - special: match a special state (null / nan / empty)
const valueMapping = z.object({ type: z.literal('value'), value: z.string().check(z.maxLength(512)), result: mappingResult });
const rangeMapping = z.object({ type: z.literal('range'), from: z.number(), to: z.number(), result: mappingResult });
const regexMapping = z.object({ type: z.literal('regex'), pattern: z.string().check(z.maxLength(512)), result: mappingResult });
const specialMapping = z.object({ type: z.literal('special'), match: z.enum(['null', 'nan', 'empty']), result: mappingResult });

export const valueMappingSchema = z.union([valueMapping, rangeMapping, regexMapping, specialMapping]);
export type ValueMapping = z.infer<typeof valueMappingSchema>;

export type ValueMappingType = ValueMapping['type'];

// Build a fresh, well-formed mapping of the given type, carrying the result across.
// The editor uses this when a row's type changes — a spread (`{ ...m, type }`) would
// leave stale/missing discriminant fields and break the union.
export const makeValueMapping = (type: ValueMappingType, result: MappingResult): ValueMapping => {
  switch (type) {
    case 'value':
      return { type, value: '', result };
    case 'range':
      return { type, from: 0, to: 0, result };
    case 'regex':
      return { type, pattern: '', result };
    case 'special':
      return { type, match: 'null', result };
    default: {
      // Exhaustiveness guard: a new mapping type must add a branch above.
      const _exhaustive: never = type;
      throw new Error(`Unknown mapping type: ${String(_exhaustive)}`);
    }
  }
};

// FieldConfigDefaults — the per-field display config. formatValue takes THIS type
// (not the whole panel) so a future per-field override can resolve to the same
// shape and reuse the formatter unchanged.
export const fieldConfigDefaults = z.object({
  unit: z._default(z.string().check(z.maxLength(64)), ''), // unit id, '' = none/short
  decimals: z.optional(z.int().check(z.minimum(0), z.maximum(10))), // undefined = auto
  min: z.optional(z.number()), // undefined = auto
  max: z.optional(z.number()),
  mappings: z._default(z.array(valueMappingSchema), []),
});

export type FieldConfigDefaults = z.infer<typeof fieldConfigDefaults>;

export const fieldConfigSchema = z.object({
  defaults: z._default(fieldConfigDefaults, { unit: '', mappings: [] }),
  // Per-field overrides are deferred to a follow-up: this is a forward-compat
  // placeholder with NO apply logic this iteration. A passthrough object (not
  // z.unknown()) on purpose — z.unknown() here makes the inferred Panel type blow
  // past the instantiation-depth limit of the Service<GraflareAPI> RPC serializer,
  // collapsing Dashboard to `never` at every web call site. A real override schema
  // replaces this empty object when overrides land.
  overrides: z._default(z.array(z.object({})), []),
});

export type FieldConfig = z.infer<typeof fieldConfigSchema>;
