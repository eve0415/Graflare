// View-state initializers + the refresh-interval lookup for the dashboard view. Kept
// pure and separate from the component so the "load the dashboard's SAVED time range /
// refresh" logic is unit-testable without rendering the route.

/** Local time-range state: the raw Grafana-style `from`/`to` expressions the toolbar edits. */
export interface ViewTimeRange {
  from: string;
  to: string;
}

/**
 * Auto-refresh selection. A superset of the stored `refresh` enum: it adds `'off'` (the stored
 * shape uses `null` for "no refresh"), since the toolbar's Select needs a concrete value. The
 * tuple is the single source of truth — the type, the lookup, and the guard all derive from it,
 * so adding an interval is a one-line change that stays type-safe everywhere.
 */
const REFRESH_INTERVALS = ['off', '5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h'] as const;

export type RefreshInterval = (typeof REFRESH_INTERVALS)[number];

/** Refresh selection → poll interval in ms, or `false` to disable polling. */
export const intervalToMs: Record<RefreshInterval, number | false> = {
  off: false,
  '5s': 5000,
  '10s': 10000,
  '30s': 30000,
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '30m': 1800000,
  '1h': 3600000,
};

/** Narrow an arbitrary string to a known refresh interval (a real guard over the tuple). */
const isRefreshInterval = (value: string): value is RefreshInterval => REFRESH_INTERVALS.some(interval => interval === value);

const DEFAULT_FROM = 'now-1h';
const DEFAULT_TO = 'now';

/**
 * The stored dashboard slice this module reads. Modelled as the persisted shape (a wide
 * `string | null` refresh, since it crosses the D1/JSON boundary) so the narrowing below is a
 * real guard, not a no-op cast. `null` / absent → the defaults.
 */
interface StoredTimeRange {
  from?: string;
  to?: string;
  refresh?: string | null;
}

/**
 * The dashboard's SAVED time range, falling back to `now-1h`/`now` when absent. Initializes the
 * view's local `timeRange` so a dashboard saved with e.g. `now-6h` opens on that window.
 */
export const initialTimeRange = (stored: StoredTimeRange | null | undefined): ViewTimeRange => ({
  from: stored?.from ?? DEFAULT_FROM,
  to: stored?.to ?? DEFAULT_TO,
});

/**
 * The dashboard's SAVED refresh, narrowed from the persisted `string | null` to a known
 * `RefreshInterval`. `null`, absent, or any unrecognised value → `'off'`, so a stored
 * `'30s'` opens auto-refreshing while a bad value degrades safely instead of being trusted.
 */
export const initialRefresh = (stored: StoredTimeRange | null | undefined): RefreshInterval => {
  const value = stored?.refresh;
  if (value !== undefined && value !== null && isRefreshInterval(value)) return value;
  return 'off';
};
