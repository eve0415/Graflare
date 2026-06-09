import type { GrafanaTransformation } from '../schemas/grafana-classic';
import type { ReduceCalc, Transformation } from '../schemas/transformation';

import { REDUCE_CALCS } from '../schemas/transformation';

// Generous bound on imported transformations: each runs over every series at render, so an unbounded
// array from a hostile/runaway import is a CPU-cost lever. Past the cap we truncate WITH a warning
// (the same honest-loss approach as the warn-drops below), never silently nor by rejecting. Mirrors
// MAX_OVERRIDES in override-mapping.ts.
const MAX_TRANSFORMATIONS = 1000;

// Read an unknown value as an array of `unknown` elements (or empty when it isn't an array). The
// explicit `readonly unknown[]` return keeps element access typed as `unknown` — `Array.isArray`
// alone narrows to `any[]`, which would leak `any` into every downstream read.
const toUnknownArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
// organize's three maps are keyed per series; bound the total keys we read from any one of them so a
// single transform can't smuggle in an unbounded record.
const MAX_ORGANIZE_KEYS = 1000;

// Grafana ReducerID → our ReduceCalc. Only the single-value reducers we model map across; everything
// else (median/stdDev/variance/range/diff/…) warn-drops, falling back to `last`. The set is the
// canonical REDUCE_CALCS, so a calc added there is recognised here automatically.
const REDUCE_CALC_SET = new Set<string>(REDUCE_CALCS);

const isReduceCalc = (value: string): value is ReduceCalc => REDUCE_CALC_SET.has(value);

// Pull the first reducer id from Grafana's `reducers: ReducerID[]` (reduce stores an array; a
// ResultSeries holds one value, so we keep the first and warn-drop the rest). Returns null when none
// is usable, so the caller falls back to the default calc.
const firstReducer = (options: unknown): string | null => {
  if (typeof options !== 'object' || options === null || !('reducers' in options)) return null;
  const [first] = toUnknownArray(options.reducers);
  return typeof first === 'string' ? first : null;
};

// Map Grafana's filterFieldsByName `{ include?/exclude?: { names?, pattern? } }` to our flat
// { mode, match, value }. include wins when both are present (Grafana applies include then exclude;
// we model one matcher, so we keep the include side and warn). A pattern maps to byRegexp, else the
// first name maps to byName.
const mapFilterFields = (options: unknown, warnings: string[]): Transformation | null => {
  if (typeof options !== 'object' || options === null) return null;
  const include = 'include' in options ? options.include : undefined;
  const exclude = 'exclude' in options ? options.exclude : undefined;

  const side = include ?? exclude;
  const mode: 'include' | 'exclude' = include === undefined ? 'exclude' : 'include';
  if (include !== undefined && exclude !== undefined) {
    warnings.push('filterFieldsByName has both include and exclude — only the include side was imported');
  }
  if (typeof side !== 'object' || side === null) return null;

  const pattern = 'pattern' in side && typeof side.pattern === 'string' ? side.pattern : '';
  const names = 'names' in side ? toUnknownArray(side.names) : [];
  const firstName = names.find((n): n is string => typeof n === 'string');

  // A pattern (when present) maps to byRegexp; otherwise the first name maps to byName. Pattern wins
  // because Grafana stores a pattern OR names, not both, on one side.
  if (pattern !== '') {
    return { id: 'filterFieldsByName', options: { mode, match: 'byRegexp', value: pattern } };
  }
  if (firstName === undefined) {
    // No usable matcher (neither a pattern nor a name) — an inert filter we can't reconstruct.
    return null;
  }
  if (names.length > 1) {
    warnings.push(`filterFieldsByName lists ${String(names.length)} names; only the first ("${firstName}") was imported`);
  }
  return { id: 'filterFieldsByName', options: { mode, match: 'byName', value: firstName } };
};

// Read a bounded `Record<string, T>` from an unknown value (one of organize's three maps), keeping
// only entries whose value passes `guard`. Caps the number of keys read (DoS bound) with a warning
// past the cap. Takes the raw value directly (the caller narrows it off the options bag with `in`).
const boundedRecord = <T>(raw: unknown, guard: (v: unknown) => v is T, label: string, warnings: string[]): Record<string, T> => {
  if (typeof raw !== 'object' || raw === null) return {};

  const out: Record<string, T> = {};
  const entries = Object.entries(raw);
  const bounded = entries.length > MAX_ORGANIZE_KEYS ? entries.slice(0, MAX_ORGANIZE_KEYS) : entries;
  if (entries.length > MAX_ORGANIZE_KEYS) {
    warnings.push(`organize ${label} has ${String(entries.length)} entries; only the first ${String(MAX_ORGANIZE_KEYS)} were imported`);
  }
  for (const [k, v] of bounded) {
    if (guard(v)) out[k] = v;
  }
  return out;
};

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const mapOrganize = (options: unknown, warnings: string[]): Transformation | null => {
  if (typeof options !== 'object' || options === null) return null;
  const excludeByName = boundedRecord('excludeByName' in options ? options.excludeByName : undefined, isBoolean, 'excludeByName', warnings);
  const renameByName = boundedRecord('renameByName' in options ? options.renameByName : undefined, isString, 'renameByName', warnings);
  const indexByName = boundedRecord('indexByName' in options ? options.indexByName : undefined, isNumber, 'indexByName', warnings);
  // An organize whose every map is empty is a no-op — drop it rather than import a transform that
  // does nothing (mirrors override-mapping dropping an override with no surviving properties).
  if (Object.keys(excludeByName).length === 0 && Object.keys(renameByName).length === 0 && Object.keys(indexByName).length === 0) {
    return null;
  }
  return { id: 'organize', options: { excludeByName, renameByName, indexByName } };
};

// Grafana sortBy stores `{ sort: [{ field, desc }] }` — it sorts ROWS by a named field. Our sortBy
// sorts the SERIES LIST by name or value, so the field name can't carry. We preserve `desc` and map
// to sort-by-value (the closest analogue for a numeric field — the common sortBy use), warning that
// the field reference was dropped.
const mapSortBy = (options: unknown, warnings: string[]): Transformation | null => {
  if (typeof options !== 'object' || options === null || !('sort' in options)) return null;
  const [first] = toUnknownArray(options.sort);
  if (first === undefined) return null;
  const desc = typeof first === 'object' && first !== null && 'desc' in first && typeof first.desc === 'boolean' ? first.desc : false;
  warnings.push('sortBy maps to series-list ordering by value — Grafana sorts rows by a named field, which Graflare does not model');
  return { id: 'sortBy', options: { by: 'value', desc } };
};

// Grafana limit stores `{ limitField?: number | string }` (a string parses to an int). Map to our
// `{ count }`, clamping to the schema's 0..10000 bound; an unparseable/absent value falls back to 10.
const mapLimit = (options: unknown): Transformation => {
  let count = 10;
  if (typeof options === 'object' && options !== null && 'limitField' in options) {
    const { limitField } = options;
    if (typeof limitField === 'number' && Number.isFinite(limitField)) count = limitField;
    else if (typeof limitField === 'string') {
      const parsed = Number.parseInt(limitField, 10);
      if (Number.isFinite(parsed)) count = parsed;
    }
  }
  return { id: 'limit', options: { count: Math.max(0, Math.min(10000, Math.round(count))) } };
};

// Map one Grafana transformation `{ id, options }` to ours, or null (warn-drop) when the id is
// unsupported or the options can't be reconstructed. A `disabled` transform is dropped silently
// (Grafana wouldn't run it either). Narrows `unknown` options with typeof/in — no casts.
const mapOne = (id: string, options: unknown, warnings: string[]): Transformation | null => {
  switch (id) {
    case 'reduce': {
      const reducer = firstReducer(options);
      const calc: ReduceCalc = reducer !== null && isReduceCalc(reducer) ? reducer : 'last';
      if (reducer !== null && !isReduceCalc(reducer)) {
        warnings.push(`reduce calc "${reducer}" is not supported — defaulted to "last"`);
      }
      const reducerCount = typeof options === 'object' && options !== null && 'reducers' in options ? toUnknownArray(options.reducers).length : 0;
      if (reducerCount > 1) {
        warnings.push(`reduce lists ${String(reducerCount)} reducers; only the first was imported`);
      }
      return { id: 'reduce', options: { calc } };
    }
    case 'filterFieldsByName':
      return mapFilterFields(options, warnings);
    case 'organize':
    case 'organizeFields':
      return mapOrganize(options, warnings);
    case 'sortBy':
      return mapSortBy(options, warnings);
    case 'limit':
      return mapLimit(options);
    default:
      warnings.push(`Transformation "${id || '(none)'}" is not supported — dropped`);
      return null;
  }
};

/**
 * Map Grafana `panel.transformations` to Graflare's Transformation[], dropping (with a warning) any
 * transform or option we don't model — the same honest, lossy approach the override mapping takes.
 * Shared by the classic and v2 import adapters so both honor the same mapping. A disabled transform
 * is skipped (Grafana wouldn't run it). The array is bounded (DoS hardening, mirroring MAX_OVERRIDES).
 */
export const mapTransformations = (transformations: readonly GrafanaTransformation[], warnings: string[]): Transformation[] => {
  const mapped: Transformation[] = [];

  const bounded = transformations.length > MAX_TRANSFORMATIONS ? transformations.slice(0, MAX_TRANSFORMATIONS) : transformations;
  if (transformations.length > MAX_TRANSFORMATIONS) {
    warnings.push(`Dashboard has ${String(transformations.length)} transformations; only the first ${String(MAX_TRANSFORMATIONS)} were imported`);
  }

  for (const t of bounded) {
    if (t.disabled === true) continue;
    const transform = mapOne(t.id, t.options, warnings);
    if (transform !== null) mapped.push(transform);
  }

  return mapped;
};
