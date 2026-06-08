import type { ValueMapping } from '@graflare/shared/schemas/field-config';
import type { Threshold } from '@graflare/shared/schemas/threshold';

import { applyValueMappings } from '@graflare/shared/format/value-mappings';

import { getThresholdColor } from './panel-data-extract';

/**
 * Resolve a discrete state's color, shared by the state-timeline and status-history
 * panels. Precedence mirrors stat/table/pie: a matching value mapping's color wins
 * (so a string state like "OK" or an exact numeric token can be colored explicitly),
 * else the highest threshold the numeric value clears, else a single `fallback`.
 *
 * The raw Prometheus token is handed to `applyValueMappings` (its `value` mappings
 * compare the string form, so non-numeric states still match), while thresholds need a
 * finite number — a non-finite token (e.g. "OK") skips thresholds entirely rather than
 * coercing to NaN and false-matching the lowest step. A mapping that matches but
 * carries no `color` does not blank the state; it falls through to the threshold path.
 */
export const stateColor = (raw: string, thresholds: readonly Threshold[], mappings: readonly ValueMapping[], fallback: string): string => {
  const mappedColor = applyValueMappings(raw, mappings)?.color;
  if (mappedColor !== undefined && mappedColor !== '') return mappedColor;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && thresholds.length > 0) {
    return getThresholdColor(numeric, [...thresholds], fallback);
  }
  return fallback;
};
