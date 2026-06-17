import type { AlertInstanceState } from '@graflare/shared/schemas/alerting';

/**
 * Decide how an instance transitions when its series disappears from the current
 * evaluation (it was not seen this tick). Returns null when no change is needed.
 *
 * - `Firing`: the alert was active and the series vanished → Resolved, and notify
 *   (mirrors the normal Firing→Resolved path).
 * - `Pending`: the threshold was breached but `forDurationS` had not elapsed, so the
 *   alert never actually fired → settle to Normal silently. Notifying here would emit
 *   a "Resolved" for an alert the user never saw fire.
 * - `Normal` / `Resolved`: already settled → no change.
 */
export const cleanupTransition = (currentState: AlertInstanceState): { state: AlertInstanceState; notify: boolean } | null => {
  if (currentState === 'Firing') return { state: 'Resolved', notify: true };
  if (currentState === 'Pending') return { state: 'Normal', notify: false };
  return null;
};
