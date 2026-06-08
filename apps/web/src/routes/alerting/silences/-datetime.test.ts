import { describe, expect, it } from 'vitest';

import { toEpoch } from './-datetime';

describe('toEpoch', () => {
  it('returns epoch milliseconds to match the silence API contract', () => {
    const dt = '2025-01-01T12:00';
    // The API stores `new Date(value)` into a timestamp_ms column, so value must be ms.
    // The old implementation divided by 1000, producing seconds → ~1970 timestamps.
    expect(toEpoch(dt)).toBe(new Date(dt).getTime());
  });

  it('returns 0 for an invalid date string', () => {
    expect(toEpoch('not-a-date')).toBe(0);
  });
});
