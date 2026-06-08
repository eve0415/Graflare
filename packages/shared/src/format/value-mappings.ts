import type { MappingResult, ValueMapping } from '../schemas/field-config';

// The raw value a panel may hold: numeric, the raw string form from Prometheus,
// or null/undefined when there is no data.
type RawValue = number | string | null | undefined;

const toNumber = (value: RawValue): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

const toStringForm = (value: RawValue): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const matchesSpecial = (value: RawValue, match: 'null' | 'nan' | 'empty'): boolean => {
  switch (match) {
    case 'null':
      return value === null || value === undefined;
    case 'nan':
      // stat/table hold the raw Prometheus token, which is the string 'NaN';
      // gauge holds a parsed number. Match both forms.
      return (typeof value === 'number' && Number.isNaN(value)) || value === 'NaN';
    case 'empty':
      return value === '';
    default: {
      const _exhaustive: never = match;
      return Boolean(_exhaustive);
    }
  }
};

const matchesMapping = (value: RawValue, mapping: ValueMapping): boolean => {
  switch (mapping.type) {
    case 'value':
      return toStringForm(value) === mapping.value;
    case 'range': {
      const n = toNumber(value);
      return Number.isFinite(n) && n >= mapping.from && n <= mapping.to;
    }
    case 'regex': {
      try {
        return new RegExp(mapping.pattern).test(toStringForm(value));
      } catch {
        // User-authored pattern rendered live — a bad pattern is a no-match, not a crash.
        return false;
      }
    }
    case 'special':
      return matchesSpecial(value, mapping.match);
    default: {
      // Exhaustiveness guard: a new mapping type must add a branch above.
      const _exhaustive: never = mapping;
      return Boolean(_exhaustive);
    }
  }
};

/**
 * Apply value mappings in order, first match wins. Returns the matched mapping's
 * result ({ text?, color? }) or null when nothing matches.
 */
export const applyValueMappings = (value: RawValue, mappings: readonly ValueMapping[]): MappingResult | null => {
  for (const mapping of mappings) {
    if (matchesMapping(value, mapping)) return mapping.result;
  }
  return null;
};
