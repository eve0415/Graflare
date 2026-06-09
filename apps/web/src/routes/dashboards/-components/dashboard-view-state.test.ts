import { describe, expect, it } from 'vitest';

import { initialRefresh, initialTimeRange, intervalToMs } from './dashboard-view-state';

// A value typed as "stored slice or absent" — lets the absent case be passed without an
// explicit `undefined` literal at the call site (which the linter flags as useless).
const absent: { from?: string; to?: string; refresh?: string | null } | undefined = undefined;

describe('initialTimeRange', () => {
  it('uses the stored from/to when present', () => {
    expect(initialTimeRange({ from: 'now-6h', to: 'now', refresh: '30s' })).toEqual({ from: 'now-6h', to: 'now' });
  });

  it('falls back to now-1h / now when the stored range is null', () => {
    expect(initialTimeRange(null)).toEqual({ from: 'now-1h', to: 'now' });
  });

  it('falls back to now-1h / now when the stored range is undefined', () => {
    expect(initialTimeRange(absent)).toEqual({ from: 'now-1h', to: 'now' });
  });

  it('fills each bound independently when only one is present', () => {
    expect(initialTimeRange({ from: 'now-12h' })).toEqual({ from: 'now-12h', to: 'now' });
    expect(initialTimeRange({ to: 'now-5m' })).toEqual({ from: 'now-1h', to: 'now-5m' });
  });
});

describe('initialRefresh', () => {
  it('uses a valid stored refresh value', () => {
    expect(initialRefresh({ from: 'now-6h', to: 'now', refresh: '30s' })).toBe('30s');
  });

  it('maps a null refresh to off', () => {
    expect(initialRefresh({ from: 'now-6h', to: 'now', refresh: null })).toBe('off');
  });

  it('maps an absent refresh to off', () => {
    expect(initialRefresh({ from: 'now-6h', to: 'now' })).toBe('off');
  });

  it('maps a missing stored range to off', () => {
    expect(initialRefresh(null)).toBe('off');
    expect(initialRefresh(absent)).toBe('off');
  });

  it('degrades an unrecognised refresh value to off rather than trusting it', () => {
    expect(initialRefresh({ refresh: '7s' })).toBe('off');
    expect(initialRefresh({ refresh: 'garbage' })).toBe('off');
  });
});

describe('intervalToMs', () => {
  it('maps off to false and known intervals to their millisecond value', () => {
    expect(intervalToMs.off).toBe(false);
    expect(intervalToMs['30s']).toBe(30000);
    expect(intervalToMs['1h']).toBe(3600000);
  });
});
