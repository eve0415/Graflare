import type { AlertForPayload } from './webhook-payload';

/** A single alert is "firing" unless it has resolved. Shared by the HTTP-based receivers. */
export const isFiring = (state: string): boolean => state === 'Firing';

export interface AlertSummary {
  hasFiring: boolean;
  firingCount: number;
  resolvedCount: number;
  statusWord: 'FIRING' | 'RESOLVED';
  /** Human count line, e.g. "2 firing, 1 resolved". */
  counts: string;
}

/** Roll a group of alerts up to the firing/resolved counts and status line every receiver shows. */
export const alertSummary = (alerts: AlertForPayload[]): AlertSummary => {
  const firingCount = alerts.filter(a => isFiring(a.state)).length;
  const resolvedCount = alerts.length - firingCount;
  const hasFiring = firingCount > 0;
  return {
    hasFiring,
    firingCount,
    resolvedCount,
    statusWord: hasFiring ? 'FIRING' : 'RESOLVED',
    counts: `${firingCount} firing, ${resolvedCount} resolved`,
  };
};

/** "[FIRING] name" / "[RESOLVED] name" (or just the bracketed state when there's no alertname). Caller truncates. */
export const alertTitle = (alert: AlertForPayload): string => {
  const name = alert.labels['alertname'];
  const prefix = isFiring(alert.state) ? '[FIRING]' : '[RESOLVED]';
  return name !== undefined && name.length > 0 ? `${prefix} ${name}` : prefix;
};

/** "summary\nValue: x" or "Value: x" when there's no summary/description. Caller truncates. */
export const alertBody = (alert: AlertForPayload): string => {
  const summary = alert.annotations['summary'] ?? alert.annotations['description'] ?? '';
  return summary.length > 0 ? `${summary}\nValue: ${alert.value}` : `Value: ${alert.value}`;
};
