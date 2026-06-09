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
  unit: z._default(z.string().check(z.maxLength(64)), ''), // unit id, '' = none (raw, no scaling)
  decimals: z.optional(z.int().check(z.minimum(0), z.maximum(10))), // undefined = auto
  min: z.optional(z.number()), // undefined = auto
  max: z.optional(z.number()),
  mappings: z._default(z.array(valueMappingSchema), []),
});

export type FieldConfigDefaults = z.infer<typeof fieldConfigDefaults>;

// Per-field override matcher. Grafana's FieldMatcherID enum (grafana-data
// transformations/matchers/ids.ts) is the source of truth; the enum below lists the
// string-option matchers we can match against a Prometheus/SQL field at render time:
//   - byName:       exact field-name equality (Grafana defaultOptions: '')
//   - byRegexp:     pattern test on the field name (Grafana defaultOptions: '/.*/' )
//   - byType:       match on the field's data type (e.g. 'number' / 'string' / 'time')
//   - byFrameRefID: match every field of a query by its refId
// `options` is a single string for all of these (mirrors Grafana's FieldMatcherInfo<string>).
// Grafana's structured-option matchers (byNames/byTypes/byValue) carry an object, not a
// string, and are intentionally out of scope this iteration — adding one is a new union
// branch with its own `options` shape, never a change to the branches below.
const fieldMatcherSchema = z.object({
  id: z.enum(['byName', 'byRegexp', 'byType', 'byFrameRefID']),
  options: z.string().check(z.maxLength(512)),
});

export type FieldMatcher = z.infer<typeof fieldMatcherSchema>;
export type FieldMatcherId = FieldMatcher['id'];

// A single override property: a literal-tagged value, one branch per FieldConfigDefaults
// key (same union pattern as valueMappingSchema above). Each branch's `value` is typed to
// the matching FieldConfigDefaults field — never `any` — so resolveFieldConfig can merge
// it onto a FieldConfigDefaults via a `switch (id)` with no casts. The set is additive: a
// new overridable field is a new branch and existing consumers keep narrowing exhaustively.
// Grafana property ids we deliberately DON'T model here: `thresholds` and `color` live at
// the panel level (panel.thresholds), not in fieldConfig.defaults, so they can't merge into
// this shape; the import adapters warn-drop them rather than silently lose data.
const unitProperty = z.object({ id: z.literal('unit'), value: z.string().check(z.maxLength(64)) });
const decimalsProperty = z.object({ id: z.literal('decimals'), value: z.int().check(z.minimum(0), z.maximum(10)) });
const minProperty = z.object({ id: z.literal('min'), value: z.number() });
const maxProperty = z.object({ id: z.literal('max'), value: z.number() });
const mappingsProperty = z.object({ id: z.literal('mappings'), value: z.array(valueMappingSchema) });

export const fieldOverridePropertySchema = z.union([unitProperty, decimalsProperty, minProperty, maxProperty, mappingsProperty]);
export type FieldOverrideProperty = z.infer<typeof fieldOverridePropertySchema>;
export type FieldOverridePropertyId = FieldOverrideProperty['id'];

// Build a fresh, well-formed override property of the given id with a neutral starting value
// (same factory pattern as makeValueMapping above; mirrors applyProperty's switch-on-id so the
// `value` type narrows per branch — never `any`/cast). The editor uses this when "Add property"
// picks an id: the property array must stay a valid discriminated union, and a spread
// (`{ ...prop, id }`) would leave a value of the wrong type for the new branch. Numeric props
// default to 0 because their schema requires a number (unlike FieldConfigDefaults, where
// min/max are optional and an empty input omits the key).
export const makeFieldOverrideProperty = (id: FieldOverridePropertyId): FieldOverrideProperty => {
  switch (id) {
    case 'unit':
      return { id, value: '' };
    case 'decimals':
      return { id, value: 0 };
    case 'min':
      return { id, value: 0 };
    case 'max':
      return { id, value: 0 };
    case 'mappings':
      return { id, value: [] };
    default: {
      // Exhaustiveness guard: a new override property must add a branch above.
      const _exhaustive: never = id;
      throw new Error(`Unknown override property id: ${String(_exhaustive)}`);
    }
  }
};

// One override entry — Grafana's `{ matcher, properties }` shape verbatim. Every field the
// matcher selects has these properties merged onto the resolved config; later entries in
// the array win (Grafana precedence), so the array order is significant.
export const fieldOverrideSchema = z.object({
  matcher: fieldMatcherSchema,
  properties: z._default(z.array(fieldOverridePropertySchema), []),
});

export type FieldOverride = z.infer<typeof fieldOverrideSchema>;

export const fieldConfigSchema = z.object({
  defaults: z._default(fieldConfigDefaults, { unit: '', mappings: [] }),
  // Per-field overrides: each entry's matcher selects fields by name/regexp/type/refId and
  // sets the listed properties on top of `defaults` (see resolveFieldConfig in
  // format/resolve-field-config.ts). Backward compatible — stored panels with `overrides: []`
  // parse and resolve to `defaults` unchanged.
  overrides: z._default(z.array(fieldOverrideSchema), []),
});

export type FieldConfig = z.infer<typeof fieldConfigSchema>;
