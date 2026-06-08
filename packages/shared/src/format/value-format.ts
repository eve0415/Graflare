import type { FieldConfigDefaults } from '../schemas/field-config';

// Clean-room formatter. Unit IDs match Grafana's valueFormats catalog for
// import/export parity, but the scaling math is implemented fresh here — Grafana's
// valueFormats source is deliberately NOT consulted for the implementation.

// Sentinel rendered for non-finite values. Never emit a scaled unit string for
// NaN/±Infinity (e.g. "NaN B") — callers that hold a raw non-numeric token guard
// upstream; this is the fallback when a number reaches us but isn't finite.
const NON_FINITE = '—';

const AUTO_MAX_DECIMALS = 2;

// A unit whose magnitude is scaled by repeated division (bytes, bits, SI numbers).
interface ScaledUnit {
  kind: 'scaled';
  step: 1000 | 1024;
  suffixes: readonly string[]; // index 0 = base, then each successive tier
  prefix?: string; // e.g. '$' for currency
  space: boolean; // space between number and suffix
}

// A duration unit: the input value is expressed in `suffixes[0]`'s unit and rolls
// up through the ladder. `factors[i]` is how many of tier i make one of tier i+1.
interface DurationUnit {
  kind: 'duration';
  factors: readonly number[]; // length === suffixes.length - 1
  suffixes: readonly string[];
}

// A percentage: optionally pre-multiplied, suffixed with '%', not magnitude-scaled.
interface PercentUnit {
  kind: 'percent';
  multiplier: number;
  suffix: string;
}

type UnitDef = ScaledUnit | DurationUnit | PercentUnit;

const SI_SUFFIXES = ['', 'K', 'M', 'G', 'T', 'P'] as const;
const IEC_BYTE = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;
const SI_BYTE = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'] as const;
const IEC_BIT = ['b', 'Kib', 'Mib', 'Gib', 'Tib', 'Pib'] as const;
const SI_BIT = ['b', 'kb', 'Mb', 'Gb', 'Tb', 'Pb'] as const;

// Duration ladders. Values roll up by these factors.
const NS_LADDER: DurationUnit = { kind: 'duration', factors: [1000, 1000, 1000, 60, 60, 24], suffixes: ['ns', 'µs', 'ms', 's', 'min', 'hour', 'day'] };
const US_LADDER: DurationUnit = { kind: 'duration', factors: [1000, 1000, 60, 60, 24], suffixes: ['µs', 'ms', 's', 'min', 'hour', 'day'] };
const MS_LADDER: DurationUnit = { kind: 'duration', factors: [1000, 60, 60, 24], suffixes: ['ms', 's', 'min', 'hour', 'day'] };
const S_LADDER: DurationUnit = { kind: 'duration', factors: [60, 60, 24], suffixes: ['s', 'min', 'hour', 'day'] };
const M_LADDER: DurationUnit = { kind: 'duration', factors: [60, 24], suffixes: ['min', 'hour', 'day'] };
const H_LADDER: DurationUnit = { kind: 'duration', factors: [24], suffixes: ['hour', 'day'] };
const D_LADDER: DurationUnit = { kind: 'duration', factors: [], suffixes: ['day'] };

// The unit registry. Adding a unit is a data-only change here. Keyed by Grafana id.
const UNITS: Record<string, UnitDef> = {
  none: { kind: 'scaled', step: 1000, suffixes: SI_SUFFIXES, space: false },
  short: { kind: 'scaled', step: 1000, suffixes: SI_SUFFIXES, space: false },
  bytes: { kind: 'scaled', step: 1024, suffixes: IEC_BYTE, space: true },
  decbytes: { kind: 'scaled', step: 1000, suffixes: SI_BYTE, space: true },
  bits: { kind: 'scaled', step: 1024, suffixes: IEC_BIT, space: true },
  decbits: { kind: 'scaled', step: 1000, suffixes: SI_BIT, space: true },
  percent: { kind: 'percent', multiplier: 1, suffix: '%' },
  percentunit: { kind: 'percent', multiplier: 100, suffix: '%' },
  currencyUSD: { kind: 'scaled', step: 1000, suffixes: SI_SUFFIXES, prefix: '$', space: false },
  ns: NS_LADDER,
  µs: US_LADDER,
  ms: MS_LADDER,
  s: S_LADDER,
  m: M_LADDER,
  h: H_LADDER,
  d: D_LADDER,
};

// Catalog for the editor: grouped, labelled options over the same id set. Single
// source of truth for the unit dropdown.
export interface UnitOption {
  id: string;
  label: string;
}
export interface UnitGroup {
  group: string;
  options: readonly UnitOption[];
}

export const UNIT_CATALOG: readonly UnitGroup[] = [
  {
    group: 'Misc',
    options: [
      { id: '', label: 'none' },
      { id: 'short', label: 'short' },
      { id: 'percent', label: 'Percent (0-100)' },
      { id: 'percentunit', label: 'Percent (0.0-1.0)' },
    ],
  },
  {
    group: 'Data',
    options: [
      { id: 'bytes', label: 'bytes (IEC)' },
      { id: 'decbytes', label: 'bytes (SI)' },
      { id: 'bits', label: 'bits (IEC)' },
      { id: 'decbits', label: 'bits (SI)' },
    ],
  },
  {
    group: 'Time',
    options: [
      { id: 'ns', label: 'nanoseconds (ns)' },
      { id: 'µs', label: 'microseconds (µs)' },
      { id: 'ms', label: 'milliseconds (ms)' },
      { id: 's', label: 'seconds (s)' },
      { id: 'm', label: 'minutes (m)' },
      { id: 'h', label: 'hours (h)' },
      { id: 'd', label: 'days (d)' },
    ],
  },
  {
    group: 'Currency',
    options: [{ id: 'currencyUSD', label: 'Dollars ($)' }],
  },
];

// Format a scaled number. `decimals` undefined = auto (trim trailing zeros, cap
// precision); set = exact toFixed.
const formatNumber = (value: number, decimals: number | undefined): string => {
  if (decimals !== undefined) return value.toFixed(decimals);
  // Auto: round to AUTO_MAX_DECIMALS, then drop trailing zeros / trailing dot.
  const rounded = Number(value.toFixed(AUTO_MAX_DECIMALS));
  return String(rounded);
};

const formatScaled = (value: number, unit: ScaledUnit, decimals: number | undefined): string => {
  const sign = value < 0 ? '-' : '';
  let abs = Math.abs(value);
  let tier = 0;
  while (abs >= unit.step && tier < unit.suffixes.length - 1) {
    abs /= unit.step;
    tier += 1;
  }
  const suffix = unit.suffixes[tier] ?? '';
  const num = formatNumber(abs, decimals);
  const gap = unit.space && suffix.length > 0 ? ' ' : '';
  const prefix = unit.prefix ?? '';
  return `${sign}${prefix}${num}${gap}${suffix}`;
};

const formatDuration = (value: number, unit: DurationUnit, decimals: number | undefined): string => {
  const sign = value < 0 ? '-' : '';
  let abs = Math.abs(value);
  let tier = 0;
  while (tier < unit.factors.length) {
    const factor = unit.factors[tier];
    if (factor === undefined || abs < factor) break;
    abs /= factor;
    tier += 1;
  }
  const suffix = unit.suffixes[tier] ?? '';
  const num = formatNumber(abs, decimals);
  return `${sign}${num} ${suffix}`;
};

const formatPercent = (value: number, unit: PercentUnit, decimals: number | undefined): string => {
  const scaled = value * unit.multiplier;
  return `${formatNumber(scaled, decimals)}${unit.suffix}`;
};

/**
 * Format a numeric value according to its field config (unit + decimals).
 * Non-finite values return a clean sentinel rather than a scaled unit string.
 */
export const formatValue = (value: number, config: FieldConfigDefaults): string => {
  if (!Number.isFinite(value)) return NON_FINITE;

  const unit = UNITS[config.unit];
  // Unknown or empty unit id -> plain SI-ish number (same as none/short).
  if (unit === undefined) {
    return formatScaled(value, { kind: 'scaled', step: 1000, suffixes: SI_SUFFIXES, space: false }, config.decimals);
  }

  switch (unit.kind) {
    case 'scaled':
      return formatScaled(value, unit, config.decimals);
    case 'duration':
      return formatDuration(value, unit, config.decimals);
    case 'percent':
      return formatPercent(value, unit, config.decimals);
    default: {
      // Exhaustiveness guard: a new unit kind must add a branch above.
      const _exhaustive: never = unit;
      return String(_exhaustive);
    }
  }
};
