import type { ValueMapping } from '@graflare/shared/schemas/field-config';

import { describe, expect, it } from 'vitest';

import { stateColor } from './state-color';

const FALLBACK = '#64748b';

const valueMapping = (match: string, color: string): ValueMapping => ({ type: 'value', value: match, result: { color } });

describe('stateColor', () => {
  it('prefers a matching value mapping color over thresholds', () => {
    const color = stateColor('2', [{ value: 0, color: '#000' }], [valueMapping('2', '#ff0000')], FALLBACK);
    expect(color).toBe('#ff0000');
  });

  it('falls back to the threshold color when no mapping matches', () => {
    const color = stateColor(
      '5',
      [
        { value: 0, color: '#00ff00' },
        { value: 3, color: '#ffaa00' },
      ],
      [valueMapping('2', '#ff0000')],
      FALLBACK,
    );
    // 5 clears the 3-threshold, so the amber step wins.
    expect(color).toBe('#ffaa00');
  });

  it('uses the fallback when neither a mapping nor a threshold applies', () => {
    expect(stateColor('1', [{ value: 10, color: '#ff0000' }], [], FALLBACK)).toBe(FALLBACK);
    expect(stateColor('1', [], [], FALLBACK)).toBe(FALLBACK);
  });

  it('matches a value mapping even when the raw token is non-numeric', () => {
    // Thresholds need a finite number; a string state like "OK" can only color via a
    // value mapping. The mapping must still win (and thresholds must be skipped, not
    // crash on NaN).
    const color = stateColor('OK', [{ value: 0, color: '#000' }], [valueMapping('OK', '#22c55e')], FALLBACK);
    expect(color).toBe('#22c55e');
  });

  it('returns the fallback for a non-numeric token with no matching mapping', () => {
    // "OK" is not finite, so thresholds are skipped entirely (no false match on the
    // 0-threshold) and nothing maps it — fallback.
    expect(stateColor('OK', [{ value: 0, color: '#000000' }], [], FALLBACK)).toBe(FALLBACK);
  });

  it('respects a mapping color of the empty string is ignored in favor of thresholds', () => {
    // A mapping that matches but carries no color should not blank the cell; the
    // threshold/fallback still applies.
    const mappingNoColor: ValueMapping = { type: 'value', value: '7', result: { text: 'lucky' } };
    expect(stateColor('7', [{ value: 0, color: '#abcdef' }], [mappingNoColor], FALLBACK)).toBe('#abcdef');
  });
});
