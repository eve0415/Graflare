/**
 * Multipliers from time-unit suffix to seconds. Fixed-duration units only — the calendar units
 * (`M` month, `y` year) vary in length, so they are deliberately absent here and handled with
 * calendar-aware UTC `Date` math instead.
 */
export const TIME_MULTIPLIERS: Readonly<Record<string, number>> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

/** Every unit the datemath grammar accepts: fixed-duration (s/m/h/d/w) plus calendar (`M`, `y`). */
const isUnit = (unit: string): boolean => unit === 'M' || unit === 'y' || unit in TIME_MULTIPLIERS;

/**
 * Shift `date` by `num` of `unit` in `direction` (+1 add, −1 subtract), in UTC. Calendar units
 * (`M`/`y`) move by the calendar so month lengths and leap years are respected; the rest are exact
 * fixed-ms arithmetic (sound in UTC, which has no DST).
 */
const shiftUnit = (date: Date, num: number, unit: string, direction: 1 | -1): void => {
  if (unit === 'M') {
    date.setUTCMonth(date.getUTCMonth() + direction * num);
    return;
  }
  if (unit === 'y') {
    date.setUTCFullYear(date.getUTCFullYear() + direction * num);
    return;
  }
  const seconds = TIME_MULTIPLIERS[unit];
  if (seconds !== undefined) date.setTime(date.getTime() + direction * num * seconds * 1000);
};

/** Round `date` DOWN to the start of `unit`, in UTC. The week starts Monday (ISO 8601). */
const startOfUnit = (date: Date, unit: string): void => {
  switch (unit) {
    case 'y':
      date.setUTCMonth(0, 1);
      date.setUTCHours(0, 0, 0, 0);
      break;
    case 'M':
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      break;
    case 'w': {
      // getUTCDay: 0=Sun..6=Sat → days since the preceding Monday.
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - daysSinceMonday);
      date.setUTCHours(0, 0, 0, 0);
      break;
    }
    case 'd':
      date.setUTCHours(0, 0, 0, 0);
      break;
    case 'h':
      date.setUTCMinutes(0, 0, 0);
      break;
    case 'm':
      date.setUTCSeconds(0, 0);
      break;
    case 's':
      date.setUTCMilliseconds(0);
      break;
  }
};

/**
 * Round `date` UP to the end of `unit` (its last instant), in UTC: start of the unit, advanced one
 * whole unit, minus 1ms. Floored to seconds by the caller this lands on the unit's last second
 * (e.g. `now/d` → 23:59:59) — matching Grafana's `endOf`-on-round behavior for the `to` bound.
 */
const endOfUnit = (date: Date, unit: string): void => {
  startOfUnit(date, unit);
  shiftUnit(date, 1, unit, 1);
  date.setTime(date.getTime() - 1);
};

/**
 * Strictly parse a Grafana-style time expression to an epoch-second number, or `null` if the input
 * is not recognised (no fallback).
 *
 * Accepted inputs:
 * - `"now"` — current epoch seconds (floored)
 * - `"now"` followed by a left-to-right chain of operators:
 *   - `±<N><unit>` — add/subtract a relative offset (default N = 1), e.g. `now-30m`, `now+2d`
 *   - `/<unit>` — snap to the unit boundary (rounding is only valid by a single whole unit, so
 *     `now/d` is accepted but `now/2d` is not); `roundUp` selects the END of the unit (the `to`
 *     bound) instead of the start (the `from` bound). Chains, e.g. `now-1d/d` (start of yesterday)
 * - Numeric string — parsed as-is (assumed epoch seconds), floored
 *
 * Units: `s` `m` `h` `d` `w` `M` (month) `y` (year). Snapping is computed in **UTC**: the function
 * is a pure function of `(expr, roundUp, Date.now())` shared by the server query path and the
 * browser, so it must not depend on ambient timezone. (Known limitation: `now/d` is midnight UTC,
 * not the viewer's local midnight — there is no per-dashboard timezone concept yet.)
 *
 * Returns `null` for anything else (`"tomorrow"`, `"now-2x"`, an offset with no unit). Note: the
 * empty string parses to `0` (JS `Number('') === 0`), not `null`.
 */
export const parseTimeExpr = (expr: string, roundUp = false): number | null => {
  // Non-`now` input is a literal epoch-seconds number (the `Number('') === 0` quirk is kept so
  // resolveTime stays byte-identical: `0 ?? x === 0`, `null ?? x === x`).
  if (!expr.startsWith('now')) {
    const parsed = Number(expr);
    return Number.isNaN(parsed) ? null : Math.floor(parsed);
  }

  const date = new Date(Date.now());
  let math = expr.slice('now'.length);
  while (math.length > 0) {
    const op = math.charAt(0);
    if (op !== '/' && op !== '+' && op !== '-') return null;
    math = math.slice(1);

    const digits = /^\d+/.exec(math)?.[0] ?? '';
    const num = digits === '' ? 1 : Number(digits);
    math = math.slice(digits.length);

    const unit = math.charAt(0);
    if (unit === '' || !isUnit(unit)) return null;
    math = math.slice(1);

    if (op === '/') {
      // Grafana allows rounding only by a single whole unit (`/d`, never `/2d` or `/0d`).
      if (num !== 1) return null;
      if (roundUp) endOfUnit(date, unit);
      else startOfUnit(date, unit);
    } else {
      shiftUnit(date, num, unit, op === '-' ? -1 : 1);
    }
  }
  return Math.floor(date.getTime() / 1000);
};

/**
 * Resolve a Grafana-style time expression to an epoch-second number.
 *
 * Thin wrapper over {@link parseTimeExpr}: falls back to the current epoch seconds for any input
 * the strict parser rejects. `roundUp` snaps `/unit` expressions to the end of the unit (the `to`
 * bound); prefer {@link resolveRange} over two bare calls so the from/to convention can't drift.
 */
export const resolveTime = (expr: string, roundUp = false): number => parseTimeExpr(expr, roundUp) ?? Math.floor(Date.now() / 1000);

/** A resolved from/to pair, both epoch seconds. */
export interface ResolvedRange {
  from: number;
  to: number;
}

/**
 * Resolve a from/to pair with Grafana's rounding convention: `from` snaps to the START of its unit,
 * `to` to the END. Use this instead of two bare {@link resolveTime} calls so a `/unit` range like
 * `now/d`–`now/d` ("today") spans the whole unit rather than collapsing to a single instant — and
 * so no call site can silently round the `to` bound down.
 */
export const resolveRange = (from: string, to: string): ResolvedRange => ({
  from: resolveTime(from, false),
  to: resolveTime(to, true),
});

/**
 * Auto-compute a reasonable step for Prometheus range queries.
 *
 * Targets roughly 250 data points across the range.
 */
export const computeStep = (from: string, to: string): string => {
  const { from: fromSec, to: toSec } = resolveRange(from, to);
  const duration = Math.max(1, toSec - fromSec);
  const step = Math.max(1, Math.floor(duration / 250));
  return `${String(step)}s`;
};
