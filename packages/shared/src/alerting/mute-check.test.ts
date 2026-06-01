import { describe, expect, it } from 'vitest';

import { isMuted } from './mute-check';

describe('isMuted', () => {
  it('returns false for empty intervals', () => {
    expect(isMuted([], new Date())).toBe(false);
  });

  it('matches weekday', () => {
    const monday = new Date('2026-06-01T12:00:00Z');
    expect(isMuted([{ weekdays: [1], startTime: '00:00', endTime: '24:00', months: [], timezone: 'UTC' }], monday)).toBe(true);
    expect(isMuted([{ weekdays: [0], startTime: '00:00', endTime: '24:00', months: [], timezone: 'UTC' }], monday)).toBe(false);
  });

  it('matches time range', () => {
    const noon = new Date('2026-06-01T12:00:00Z');
    expect(isMuted([{ weekdays: [], startTime: '10:00', endTime: '14:00', months: [], timezone: 'UTC' }], noon)).toBe(true);
    expect(isMuted([{ weekdays: [], startTime: '14:00', endTime: '16:00', months: [], timezone: 'UTC' }], noon)).toBe(false);
  });

  it('matches month', () => {
    const june = new Date('2026-06-01T12:00:00Z');
    expect(isMuted([{ weekdays: [], startTime: '00:00', endTime: '24:00', months: [6], timezone: 'UTC' }], june)).toBe(true);
    expect(isMuted([{ weekdays: [], startTime: '00:00', endTime: '24:00', months: [1], timezone: 'UTC' }], june)).toBe(false);
  });

  it('handles timezone conversion', () => {
    const utcNoon = new Date('2026-06-01T12:00:00Z');
    expect(isMuted([{ weekdays: [], startTime: '20:00', endTime: '22:00', months: [], timezone: 'Asia/Tokyo' }], utcNoon)).toBe(true);
  });

  it('any interval matching means muted', () => {
    const noon = new Date('2026-06-01T12:00:00Z');
    expect(
      isMuted(
        [
          { weekdays: [], startTime: '00:00', endTime: '01:00', months: [], timezone: 'UTC' },
          { weekdays: [], startTime: '11:00', endTime: '13:00', months: [], timezone: 'UTC' },
        ],
        noon,
      ),
    ).toBe(true);
  });

  it('combined weekday + time range', () => {
    const mondayNoon = new Date('2026-06-01T12:00:00Z');
    expect(isMuted([{ weekdays: [1], startTime: '10:00', endTime: '14:00', months: [], timezone: 'UTC' }], mondayNoon)).toBe(true);
    expect(isMuted([{ weekdays: [2], startTime: '10:00', endTime: '14:00', months: [], timezone: 'UTC' }], mondayNoon)).toBe(false);
    expect(isMuted([{ weekdays: [1], startTime: '14:00', endTime: '16:00', months: [], timezone: 'UTC' }], mondayNoon)).toBe(false);
  });
});
