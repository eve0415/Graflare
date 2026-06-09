import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeStep, parseTimeExpr, resolveRange, resolveTime } from './resolve';

// A fixed wall clock so `now`-relative assertions are exact, not delta-based.
// 2023-11-14T22:13:20Z = 1700000000s. Chosen with a whole-second epoch so
// `floor(now/1000)` is stable regardless of sub-second drift.
const FIXED_MS = 1_700_000_000_000;
const NOW = 1_700_000_000;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(FIXED_MS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Characterization: these pin the *current* observable behavior of resolveTime,
// which runs on the server query path. They must stay green through the refactor.
describe('resolveTime characterization', () => {
  it('resolves "now" to floor(Date.now()/1000)', () => {
    expect(resolveTime('now')).toBe(NOW);
  });

  it('resolves "now-30m" to now minus 1800s', () => {
    expect(resolveTime('now-30m')).toBe(NOW - 1800);
  });

  it('resolves "now-2h" to now minus 7200s', () => {
    expect(resolveTime('now-2h')).toBe(NOW - 7200);
  });

  it('resolves each relative unit', () => {
    expect(resolveTime('now-45s')).toBe(NOW - 45);
    expect(resolveTime('now-3d')).toBe(NOW - 3 * 86400);
    expect(resolveTime('now-2w')).toBe(NOW - 2 * 604800);
  });

  it('parses a numeric string as epoch seconds, floored', () => {
    expect(resolveTime('1700000000')).toBe(1700000000);
    expect(resolveTime('1699999999.9')).toBe(1699999999);
  });

  it('falls back to floor(now) for unrecognised non-numeric input', () => {
    expect(resolveTime('garbage')).toBe(NOW);
    expect(resolveTime('now-2x')).toBe(NOW);
    expect(resolveTime('tomorrow')).toBe(NOW);
  });

  // JS quirk: Number('') === 0, so the existing numeric branch returns 0 here —
  // NOT floor(now). Pinned exactly so the refactor preserves it byte-for-byte.
  it('resolves the empty string to 0 (Number("") === 0 quirk)', () => {
    expect(resolveTime('')).toBe(0);
  });
});

// Direct parser tests: strict null for unrecognised input (no fallback).
describe('parseTimeExpr', () => {
  it('returns a number for valid expressions', () => {
    expect(parseTimeExpr('now')).toBe(NOW);
    expect(parseTimeExpr('now-30m')).toBe(NOW - 1800);
    expect(parseTimeExpr('1700000000')).toBe(1700000000);
  });

  it('returns null for unrecognised non-numeric input', () => {
    expect(parseTimeExpr('now-2x')).toBeNull();
    expect(parseTimeExpr('tomorrow')).toBeNull();
    expect(parseTimeExpr('garbage')).toBeNull();
    expect(parseTimeExpr('now-30')).toBeNull(); // offset with no unit
    expect(parseTimeExpr('now-1d/d/')).toBeNull(); // trailing operator, no unit
  });

  // The empty string is numeric (Number('') === 0), so it parses to 0 — not null.
  // This is forced by resolveTime byte-identity: 0 ?? x === 0, null ?? x === x.
  it('returns 0 for the empty string, never null', () => {
    expect(parseTimeExpr('')).toBe(0);
  });

  // Future offsets: a safe-additive parity extension. Previously these fell back
  // to floor(now); now they resolve correctly. The `now-N` results are unchanged.
  it('resolves "now+<N><unit>" as a future offset', () => {
    expect(parseTimeExpr('now+1h')).toBe(NOW + 3600);
    expect(parseTimeExpr('now+30m')).toBe(NOW + 1800);
    expect(parseTimeExpr('now+2d')).toBe(NOW + 2 * 86400);
  });

  it('keeps "now-<N><unit>" symmetric across both signs', () => {
    expect(parseTimeExpr('now-1h')).toBe(NOW - 3600);
    expect(parseTimeExpr('now+1h')).toBe(NOW + 3600);
  });
});

// `/unit` snapping (Grafana datemath). The fixed clock is 2023-11-14T22:13:20Z, a Tuesday.
// Snapping is done in UTC (the resolver is a pure fn of (expr, now) shared server+client, so it
// must not depend on ambient timezone). Expected boundaries are spelled out with Date.UTC.
const sec = (ms: number): number => Math.floor(ms / 1000);

describe('parseTimeExpr /unit snapping (round down, default)', () => {
  it('snaps to the start of each unit in UTC', () => {
    expect(parseTimeExpr('now/s')).toBe(sec(Date.UTC(2023, 10, 14, 22, 13, 20)));
    expect(parseTimeExpr('now/m')).toBe(sec(Date.UTC(2023, 10, 14, 22, 13)));
    expect(parseTimeExpr('now/h')).toBe(sec(Date.UTC(2023, 10, 14, 22)));
    expect(parseTimeExpr('now/d')).toBe(sec(Date.UTC(2023, 10, 14)));
    expect(parseTimeExpr('now/M')).toBe(sec(Date.UTC(2023, 10, 1)));
    expect(parseTimeExpr('now/y')).toBe(sec(Date.UTC(2023, 0, 1)));
  });

  it('snaps the week to the preceding Monday (ISO week start)', () => {
    // Tue 2023-11-14 → Mon 2023-11-13.
    expect(parseTimeExpr('now/w')).toBe(sec(Date.UTC(2023, 10, 13)));
  });

  it('applies offsets before the round, left to right', () => {
    expect(parseTimeExpr('now-1d/d')).toBe(sec(Date.UTC(2023, 10, 13))); // start of yesterday
    expect(parseTimeExpr('now/d+6h')).toBe(sec(Date.UTC(2023, 10, 14, 6))); // 06:00 today
    expect(parseTimeExpr('now-1M/M')).toBe(sec(Date.UTC(2023, 9, 1))); // start of October
  });

  it('rejects rounding by anything but a single whole unit', () => {
    expect(parseTimeExpr('now/2d')).toBeNull();
    expect(parseTimeExpr('now/0d')).toBeNull();
  });
});

describe('parseTimeExpr /unit snapping (round up, roundUp=true)', () => {
  it('snaps to the END of each unit (last whole second)', () => {
    expect(parseTimeExpr('now/d', true)).toBe(sec(Date.UTC(2023, 10, 15)) - 1); // 23:59:59 today
    expect(parseTimeExpr('now/h', true)).toBe(sec(Date.UTC(2023, 10, 14, 23)) - 1);
    expect(parseTimeExpr('now/M', true)).toBe(sec(Date.UTC(2023, 11, 1)) - 1); // 2023-11-30 23:59:59
    expect(parseTimeExpr('now/y', true)).toBe(sec(Date.UTC(2024, 0, 1)) - 1);
    expect(parseTimeExpr('now/w', true)).toBe(sec(Date.UTC(2023, 10, 20)) - 1); // Sun 2023-11-19 23:59:59
  });

  it('leaves non-rounding expressions unaffected by roundUp', () => {
    expect(parseTimeExpr('now', true)).toBe(NOW);
    expect(parseTimeExpr('now-1h', true)).toBe(NOW - 3600);
  });
});

describe('resolveRange', () => {
  it('rounds from down and to up — the Grafana "Today" quick range', () => {
    expect(resolveRange('now/d', 'now/d')).toEqual({
      from: sec(Date.UTC(2023, 10, 14)),
      to: sec(Date.UTC(2023, 10, 15)) - 1,
    });
  });

  it('passes relative ranges through unchanged (no rounding tokens)', () => {
    expect(resolveRange('now-1h', 'now')).toEqual({ from: NOW - 3600, to: NOW });
  });
});

// resolveTime gains correct now+N handling for free via parseTimeExpr.
describe('resolveTime future offsets', () => {
  it('resolves "now+1h" to now plus 3600s', () => {
    expect(resolveTime('now+1h')).toBe(NOW + 3600);
  });
});

describe('computeStep', () => {
  it('targets ~250 points across the range', () => {
    expect(computeStep('now-1h', 'now')).toBe('14s');
  });

  it('never returns a step below 1s', () => {
    expect(computeStep('now', 'now')).toBe('1s');
  });
});
