import type { FieldMatcherId, FieldOverride, FieldOverrideProperty } from '../schemas/field-config';
import type { GrafanaOverride } from '../schemas/grafana-classic';

// Generous bounds on what an imported dashboard can carry: each override compiles a RegExp
// (byRegexp) and is iterated per series at render, so an unbounded array from a hostile/runaway
// import is a CPU-cost lever. No real dashboard approaches these; past them we truncate WITH a
// warning (the same honest-loss approach as the warn-drop below), never silently nor by rejecting.
const MAX_OVERRIDES = 1000;
const MAX_PROPERTIES_PER_OVERRIDE = 64;

// Grafana FieldMatcherID → Graflare matcher id, limited to the string-option matchers we
// resolve at render time (see fieldMatcherSchema). Grafana's structured-option matchers
// (byNames/byTypes/byRegexpOrNames/byValue) and the no-argument ones (numeric/time/first/…)
// carry no single string we can match a field name/type/refId against, so they warn-drop.
const MATCHER_ID_MAP: Record<string, FieldMatcherId> = {
  byName: 'byName',
  byRegexp: 'byRegexp',
  byType: 'byType',
  byFrameRefID: 'byFrameRefID',
};

// Grafana standard field-config property ids we map onto FieldConfigDefaults. `unit`,
// `min`, `max`, `decimals` line up 1:1. Everything else (color, thresholds, mappings, links,
// and any `custom.*` panel-specific id) warn-drops — those either live elsewhere in our
// model (thresholds are panel-level) or aren't part of FieldConfigDefaults.
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Build a typed override property from a Grafana `{ id, value }`, or null (warn-drop) if the
// id is unsupported or the value has the wrong runtime shape. Narrows `unknown` with typeof —
// no casts — so a malformed import value is skipped rather than trusted.
const mapProperty = (id: string, value: unknown, fieldName: string, warnings: string[]): FieldOverrideProperty | null => {
  switch (id) {
    case 'unit':
      if (typeof value === 'string') return { id: 'unit', value };
      break;
    case 'decimals':
      // Grafana decimals can be a float; our schema is a 0..10 int. Clamp+round to fit.
      if (isNumber(value)) return { id: 'decimals', value: Math.max(0, Math.min(10, Math.round(value))) };
      break;
    case 'min':
      if (isNumber(value)) return { id: 'min', value };
      break;
    case 'max':
      if (isNumber(value)) return { id: 'max', value };
      break;
    default:
      break;
  }
  warnings.push(`Field override on "${fieldName}" sets unsupported property "${id}" — dropped`);
  return null;
};

// Pull the matcher's string option (byName/byRegexp/byType/byFrameRefID all take a string).
// A structured/absent option means the matcher can't be expressed as one of ours.
const matcherOption = (options: unknown): string | null => (typeof options === 'string' ? options : null);

/**
 * Map Grafana fieldConfig.overrides to Graflare's FieldOverride[], dropping (with a warning)
 * any matcher or property we don't model — the same honest, lossy approach the variable
 * mapping takes. An override whose matcher is unsupported is dropped whole; an override whose
 * matcher is fine keeps only its supported properties (and is itself dropped if none survive).
 * Shared by the classic and v2 import adapters so both honor the same mapping.
 */
export const mapOverrides = (overrides: readonly GrafanaOverride[], warnings: string[]): FieldOverride[] => {
  const mapped: FieldOverride[] = [];

  const boundedOverrides = overrides.length > MAX_OVERRIDES ? overrides.slice(0, MAX_OVERRIDES) : overrides;
  if (overrides.length > MAX_OVERRIDES) {
    warnings.push(`Dashboard has ${String(overrides.length)} field overrides; only the first ${String(MAX_OVERRIDES)} were imported`);
  }

  for (const o of boundedOverrides) {
    const matcherId = MATCHER_ID_MAP[o.matcher.id];
    const option = matcherOption(o.matcher.options);
    if (matcherId === undefined || option === null) {
      warnings.push(`Field override with matcher "${o.matcher.id || '(none)'}" is not supported — dropped`);
      continue;
    }

    const boundedProps = o.properties.length > MAX_PROPERTIES_PER_OVERRIDE ? o.properties.slice(0, MAX_PROPERTIES_PER_OVERRIDE) : o.properties;
    if (o.properties.length > MAX_PROPERTIES_PER_OVERRIDE) {
      warnings.push(
        `Field override on "${option}" has ${String(o.properties.length)} properties; only the first ${String(MAX_PROPERTIES_PER_OVERRIDE)} were imported`,
      );
    }

    const properties: FieldOverrideProperty[] = [];
    for (const p of boundedProps) {
      const prop = mapProperty(p.id, p.value, option, warnings);
      if (prop !== null) properties.push(prop);
    }

    // An override whose every property dropped carries no effect — skip it rather than
    // import a matcher that sets nothing.
    if (properties.length === 0) continue;

    mapped.push({ matcher: { id: matcherId, options: option }, properties });
  }

  return mapped;
};
