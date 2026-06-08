/** Multipliers from time-unit suffix to seconds. */
export const TIME_MULTIPLIERS: Readonly<Record<string, number>> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

/**
 * Strictly parse a Grafana-style time expression to an epoch-second number,
 * or `null` if the input is not recognised (no fallback).
 *
 * Accepted inputs:
 * - `"now"` — current epoch seconds (floored)
 * - `"now-<N><unit>"` / `"now+<N><unit>"` — relative offset (s/m/h/d/w),
 *   past or future
 * - Numeric string — parsed as-is (assumed epoch seconds), floored
 *
 * Returns `null` for anything else (e.g. `"now/d"`, `"tomorrow"`, `"now-2x"`).
 * Note: the empty string parses to `0` (JS `Number('') === 0`), not `null`.
 */
export const parseTimeExpr = (expr: string): number | null => {
  if (expr === 'now') return Math.floor(Date.now() / 1000);

  const match = /^now([+-])(\d+)([smhdw])$/.exec(expr);
  if (match !== null) {
    const [, sign, amount, unit] = match;
    if (sign !== undefined && amount !== undefined && unit !== undefined) {
      const multiplier = TIME_MULTIPLIERS[unit];
      if (multiplier !== undefined) {
        const direction = sign === '-' ? -1 : 1;
        return Math.floor(Date.now() / 1000) + direction * Number(amount) * multiplier;
      }
    }
  }

  const parsed = Number(expr);
  if (!Number.isNaN(parsed)) return Math.floor(parsed);

  return null;
};

/**
 * Resolve a Grafana-style time expression to an epoch-second number.
 *
 * Thin wrapper over {@link parseTimeExpr}: falls back to the current epoch
 * seconds for any input the strict parser rejects. Used on the server query
 * path, so its observable behavior is intentionally identical to before
 * (the only added input it now resolves is the `"now+<N><unit>"` future form,
 * which previously hit the same fallback).
 */
export const resolveTime = (expr: string): number => parseTimeExpr(expr) ?? Math.floor(Date.now() / 1000);

/**
 * Auto-compute a reasonable step for Prometheus range queries.
 *
 * Targets roughly 250 data points across the range.
 */
export const computeStep = (from: string, to: string): string => {
  const fromSec = resolveTime(from);
  const toSec = resolveTime(to);
  const duration = Math.max(1, toSec - fromSec);
  const step = Math.max(1, Math.floor(duration / 250));
  return `${String(step)}s`;
};
