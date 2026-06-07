/** Multipliers from time-unit suffix to seconds. */
export const TIME_MULTIPLIERS: Readonly<Record<string, number>> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

/**
 * Resolve a Grafana-style time expression to an epoch-second number.
 *
 * Accepted inputs:
 * - `"now"` — current epoch seconds (floored)
 * - `"now-<N><unit>"` — relative offset (s/m/h/d/w)
 * - Numeric string — parsed as-is (assumed epoch seconds)
 *
 * Falls back to current epoch seconds for unrecognised input.
 */
export const resolveTime = (expr: string): number => {
  if (expr === 'now') return Math.floor(Date.now() / 1000);

  const match = /^now-(\d+)([smhdw])$/.exec(expr);
  if (match !== null) {
    const [, amount, unit] = match;
    if (amount !== undefined && unit !== undefined) {
      const multiplier = TIME_MULTIPLIERS[unit];
      if (multiplier !== undefined) {
        return Math.floor(Date.now() / 1000) - Number(amount) * multiplier;
      }
    }
  }

  const parsed = Number(expr);
  if (!Number.isNaN(parsed)) return Math.floor(parsed);

  return Math.floor(Date.now() / 1000);
};

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
