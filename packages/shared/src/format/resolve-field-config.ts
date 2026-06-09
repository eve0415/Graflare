import type { FieldConfig, FieldConfigDefaults, FieldMatcher, FieldOverrideProperty } from '../schemas/field-config';

// A field as seen at render time. `name` is the series/column name (always present);
// `type` is the field's data type when the source carries one (SQL columns do — see
// sqlColumnTypeSchema; Prometheus series don't, so it's optional and byType simply
// can't match them); `refId` is the originating query's refId when the panel knows it
// (enables byFrameRefID). Additive by design — a new matcher that keys off more field
// metadata adds an optional key here without touching existing callers.
export interface FieldDescriptor {
  name: string;
  type?: string;
  refId?: string;
}

// Does this matcher select the given field? Pure and total: an unmatchable matcher
// (byType/byFrameRefID against a field that carries no type/refId) and any future matcher
// id that reaches the exhaustiveness guard both return false — never throw, so a stored
// override authored against a richer field model degrades to "no match", not a crash.
const matcherMatches = (matcher: FieldMatcher, field: FieldDescriptor): boolean => {
  switch (matcher.id) {
    case 'byName':
      return field.name === matcher.options;
    case 'byRegexp':
      try {
        return new RegExp(matcher.options).test(field.name);
      } catch {
        // Authored pattern — a bad regex is a no-match, not a crash (mirrors applyValueMappings).
        return false;
      }
    case 'byType':
      return field.type !== undefined && field.type === matcher.options;
    case 'byFrameRefID':
      return field.refId !== undefined && field.refId === matcher.options;
    default: {
      // Exhaustiveness guard: a new matcher id must add a branch above; until then it
      // matches nothing rather than throwing.
      const _exhaustive: never = matcher.id;
      return Boolean(_exhaustive);
    }
  }
};

// Fold one override property onto an effective config. Returns a NEW object (never mutates
// the input) with the single keyed field replaced. The discriminated union on `id` lets the
// `value` type narrow per branch — no casts, and a new property is a new branch the compiler
// forces you to handle.
const applyProperty = (config: FieldConfigDefaults, property: FieldOverrideProperty): FieldConfigDefaults => {
  switch (property.id) {
    case 'unit':
      return { ...config, unit: property.value };
    case 'decimals':
      return { ...config, decimals: property.value };
    case 'min':
      return { ...config, min: property.value };
    case 'max':
      return { ...config, max: property.value };
    case 'mappings':
      return { ...config, mappings: property.value };
    default: {
      // Exhaustiveness guard: a new override property must add a branch above.
      const _exhaustive: never = property;
      return _exhaustive;
    }
  }
};

/**
 * Resolve a field's effective display config: start from `fieldConfig.defaults`, then for
 * each override whose matcher selects this field, merge its properties on top. Overrides
 * apply in array order and later ones win (Grafana precedence), so within a single resolve
 * the last matching override's value for a given property is the one that sticks.
 *
 * Pure, deterministic, no React. Returns a value of the SAME shape `formatValue` /
 * `applyValueMappings` already take (FieldConfigDefaults), so render sites swap a direct
 * `panel.fieldConfig.defaults` read for `resolveFieldConfig(field, panel.fieldConfig)` with
 * no other change.
 *
 * Byte-equivalence guarantee: when nothing matches (the common case — no overrides, or
 * overrides that don't select this field) the returned reference IS `fieldConfig.defaults`,
 * so memo dependencies stay stable and a defaults-only render is identical to before overrides.
 */
export const resolveFieldConfig = (field: FieldDescriptor, fieldConfig: FieldConfig): FieldConfigDefaults => {
  // `config` starts as the defaults reference and is only ever reassigned by a property
  // fold, so on any no-effect path (no matching override, or a matched override that sets
  // nothing) it stays === fieldConfig.defaults — that reference identity is the
  // byte-equivalence guarantee, no separate flag needed.
  let config = fieldConfig.defaults;
  for (const override of fieldConfig.overrides) {
    if (!matcherMatches(override.matcher, field)) continue;
    for (const property of override.properties) {
      config = applyProperty(config, property);
    }
  }
  return config;
};
