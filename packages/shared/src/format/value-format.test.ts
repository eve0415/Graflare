import type { FieldConfigDefaults } from '../schemas/field-config';

import { describe, expect, it } from 'vitest';

import { UNIT_CATALOG, formatValue } from './value-format';

const cfg = (over: Partial<FieldConfigDefaults> = {}): FieldConfigDefaults => ({ unit: '', mappings: [], ...over });

describe('formatValue', () => {
  describe('non-finite / non-numeric', () => {
    it('returns the em-dash sentinel for NaN, never a scaled unit string', () => {
      expect(formatValue(Number.NaN, cfg({ unit: 'bytes' }))).toBe('—');
      expect(formatValue(Number.NaN, cfg())).toBe('—');
    });

    it('returns the sentinel for +/- Infinity', () => {
      expect(formatValue(Number.POSITIVE_INFINITY, cfg({ unit: 'percent' }))).toBe('—');
      expect(formatValue(Number.NEGATIVE_INFINITY, cfg({ unit: 'bytes' }))).toBe('—');
    });
  });

  describe('none / short (SI-ish suffixes)', () => {
    it('leaves small magnitudes plain', () => {
      expect(formatValue(42, cfg())).toBe('42');
      expect(formatValue(0, cfg())).toBe('0');
      expect(formatValue(-7, cfg())).toBe('-7');
    });

    it('appends k/M/G/T for large magnitudes (step 1000)', () => {
      expect(formatValue(1500, cfg())).toBe('1.5K');
      expect(formatValue(2_500_000, cfg())).toBe('2.5M');
      expect(formatValue(3_000_000_000, cfg())).toBe('3G');
      expect(formatValue(4_200_000_000_000, cfg())).toBe('4.2T');
    });

    it('short behaves like none', () => {
      expect(formatValue(1500, cfg({ unit: 'short' }))).toBe('1.5K');
      expect(formatValue(42, cfg({ unit: 'none' }))).toBe('42');
    });

    it('handles negative large magnitudes', () => {
      expect(formatValue(-1500, cfg())).toBe('-1.5K');
    });
  });

  describe('bytes (IEC, step 1024)', () => {
    it('scales through B/KiB/MiB/GiB/TiB', () => {
      expect(formatValue(512, cfg({ unit: 'bytes' }))).toBe('512 B');
      expect(formatValue(1024, cfg({ unit: 'bytes' }))).toBe('1 KiB');
      expect(formatValue(1536, cfg({ unit: 'bytes' }))).toBe('1.5 KiB');
      expect(formatValue(1024 * 1024, cfg({ unit: 'bytes' }))).toBe('1 MiB');
      expect(formatValue(1024 * 1024 * 1024, cfg({ unit: 'bytes' }))).toBe('1 GiB');
      expect(formatValue(1024 ** 4, cfg({ unit: 'bytes' }))).toBe('1 TiB');
    });

    it('handles zero and negatives', () => {
      expect(formatValue(0, cfg({ unit: 'bytes' }))).toBe('0 B');
      expect(formatValue(-1536, cfg({ unit: 'bytes' }))).toBe('-1.5 KiB');
    });
  });

  describe('decbytes (SI, step 1000)', () => {
    it('scales through B/kB/MB/GB/TB', () => {
      expect(formatValue(500, cfg({ unit: 'decbytes' }))).toBe('500 B');
      expect(formatValue(1000, cfg({ unit: 'decbytes' }))).toBe('1 kB');
      expect(formatValue(1500, cfg({ unit: 'decbytes' }))).toBe('1.5 kB');
      expect(formatValue(1_000_000, cfg({ unit: 'decbytes' }))).toBe('1 MB');
      expect(formatValue(1_000_000_000, cfg({ unit: 'decbytes' }))).toBe('1 GB');
    });
  });

  describe('bits / decbits', () => {
    it('bits scales IEC with bit suffixes', () => {
      expect(formatValue(1024, cfg({ unit: 'bits' }))).toBe('1 Kib');
      expect(formatValue(512, cfg({ unit: 'bits' }))).toBe('512 b');
    });

    it('decbits scales SI with bit suffixes', () => {
      expect(formatValue(1000, cfg({ unit: 'decbits' }))).toBe('1 kb');
    });
  });

  describe('percent (0-100, value as-is)', () => {
    it('appends % without scaling', () => {
      expect(formatValue(87, cfg({ unit: 'percent' }))).toBe('87%');
      expect(formatValue(0, cfg({ unit: 'percent' }))).toBe('0%');
      expect(formatValue(100, cfg({ unit: 'percent' }))).toBe('100%');
    });

    it('honors decimals', () => {
      expect(formatValue(87.456, cfg({ unit: 'percent', decimals: 1 }))).toBe('87.5%');
    });
  });

  describe('percentunit (0.0-1.0 -> x100)', () => {
    it('multiplies by 100 then appends %', () => {
      expect(formatValue(0.87, cfg({ unit: 'percentunit' }))).toBe('87%');
      expect(formatValue(1, cfg({ unit: 'percentunit' }))).toBe('100%');
      expect(formatValue(0, cfg({ unit: 'percentunit' }))).toBe('0%');
    });

    it('honors decimals after scaling', () => {
      expect(formatValue(0.876, cfg({ unit: 'percentunit', decimals: 1 }))).toBe('87.6%');
    });
  });

  describe('duration units (value is in the named unit, rolls up)', () => {
    it('seconds roll up s -> m -> h -> d', () => {
      expect(formatValue(45, cfg({ unit: 's' }))).toBe('45 s');
      expect(formatValue(90, cfg({ unit: 's' }))).toBe('1.5 min');
      expect(formatValue(3600, cfg({ unit: 's' }))).toBe('1 hour');
      expect(formatValue(86400, cfg({ unit: 's' }))).toBe('1 day');
    });

    it('milliseconds roll up ms -> s -> m', () => {
      expect(formatValue(500, cfg({ unit: 'ms' }))).toBe('500 ms');
      expect(formatValue(1500, cfg({ unit: 'ms' }))).toBe('1.5 s');
      expect(formatValue(90000, cfg({ unit: 'ms' }))).toBe('1.5 min');
    });

    it('nanoseconds roll up ns -> µs -> ms', () => {
      expect(formatValue(500, cfg({ unit: 'ns' }))).toBe('500 ns');
      expect(formatValue(1500, cfg({ unit: 'ns' }))).toBe('1.5 µs');
      expect(formatValue(1_500_000, cfg({ unit: 'ns' }))).toBe('1.5 ms');
    });

    it('microseconds roll up µs -> ms -> s', () => {
      expect(formatValue(500, cfg({ unit: 'µs' }))).toBe('500 µs');
      expect(formatValue(1500, cfg({ unit: 'µs' }))).toBe('1.5 ms');
    });

    it('minutes / hours / days as base units roll up', () => {
      expect(formatValue(90, cfg({ unit: 'm' }))).toBe('1.5 hour');
      expect(formatValue(36, cfg({ unit: 'h' }))).toBe('1.5 day');
      expect(formatValue(2, cfg({ unit: 'd' }))).toBe('2 day');
    });

    it('handles zero duration', () => {
      expect(formatValue(0, cfg({ unit: 's' }))).toBe('0 s');
    });
  });

  describe('currencyUSD (prefix, scales like short)', () => {
    it('prefixes the dollar sign and scales large magnitudes', () => {
      expect(formatValue(42, cfg({ unit: 'currencyUSD' }))).toBe('$42');
      expect(formatValue(1500, cfg({ unit: 'currencyUSD' }))).toBe('$1.5K');
      expect(formatValue(2_500_000, cfg({ unit: 'currencyUSD' }))).toBe('$2.5M');
    });
  });

  describe('decimals: set vs auto', () => {
    it('auto (undefined) trims trailing zeros, caps at a sensible precision', () => {
      expect(formatValue(1, cfg({ unit: 'bytes' }))).toBe('1 B');
      expect(formatValue(1536, cfg({ unit: 'bytes' }))).toBe('1.5 KiB');
    });

    it('decimals=0 rounds to integer', () => {
      expect(formatValue(1536, cfg({ unit: 'bytes', decimals: 0 }))).toBe('2 KiB');
      expect(formatValue(87.6, cfg({ unit: 'percent', decimals: 0 }))).toBe('88%');
    });

    it('decimals=2 pads to exactly two places', () => {
      expect(formatValue(1, cfg({ unit: 'bytes', decimals: 2 }))).toBe('1.00 B');
      expect(formatValue(1536, cfg({ unit: 'bytes', decimals: 2 }))).toBe('1.50 KiB');
      expect(formatValue(50, cfg({ unit: 'percent', decimals: 2 }))).toBe('50.00%');
    });

    it('decimals on none/short', () => {
      expect(formatValue(1234, cfg({ decimals: 2 }))).toBe('1.23K');
    });
  });

  describe('unknown unit id falls back to plain number', () => {
    it('formats as a number when the unit is not in the catalog', () => {
      expect(formatValue(1500, cfg({ unit: 'not-a-real-unit' }))).toBe('1.5K');
    });
  });

  describe('unit catalog', () => {
    it('exposes grouped unit options for the editor', () => {
      expect(UNIT_CATALOG.length).toBeGreaterThan(0);
      const allIds = UNIT_CATALOG.flatMap(g => g.options.map(o => o.id));
      expect(allIds).toContain('bytes');
      expect(allIds).toContain('percent');
      expect(allIds).toContain('s');
      // ids unique across the whole catalog
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });
});
