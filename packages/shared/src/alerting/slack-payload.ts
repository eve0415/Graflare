import type { AlertForPayload } from './webhook-payload';

/** Slack attachment colors (hex) — red for firing, green for resolved. */
const SLACK_COLOR_FIRING = '#D32F2F';
const SLACK_COLOR_RESOLVED = '#388E3C';

/** Slack caps attachments per message at 100; keep well under that. */
const MAX_ATTACHMENTS = 20;

export interface SlackField {
  title: string;
  value: string;
  short: boolean;
}

export interface SlackAttachment {
  color: string;
  title: string;
  text: string;
  fields: SlackField[];
}

export interface SlackPayload {
  text: string;
  attachments: SlackAttachment[];
  /** Channel override — present only when set. */
  channel?: string;
  /** Username override — present only when set. */
  username?: string;
}

export interface SlackPayloadOptions {
  channel?: string;
  username?: string;
}

const isFiring = (state: string): boolean => state === 'Firing';

const labelFields = (labels: Record<string, string>): SlackField[] => Object.entries(labels).map(([title, value]) => ({ title, value, short: true }));

const alertTitle = (alert: AlertForPayload): string => {
  const name = alert.labels['alertname'];
  const prefix = isFiring(alert.state) ? '[FIRING]' : '[RESOLVED]';
  return name !== undefined && name.length > 0 ? `${prefix} ${name}` : prefix;
};

const alertText = (alert: AlertForPayload): string => {
  const summary = alert.annotations['summary'] ?? alert.annotations['description'] ?? '';
  return summary.length > 0 ? `${summary}\nValue: ${alert.value}` : `Value: ${alert.value}`;
};

export const buildSlackPayload = (alerts: AlertForPayload[], receiver: string, externalURL: string, opts: SlackPayloadOptions = {}): SlackPayload => {
  const hasFiring = alerts.some(a => isFiring(a.state));
  const firingCount = alerts.filter(a => isFiring(a.state)).length;
  const resolvedCount = alerts.length - firingCount;

  const statusWord = hasFiring ? 'FIRING' : 'RESOLVED';
  const counts = `${firingCount} firing, ${resolvedCount} resolved`;
  const text = `[${statusWord}] ${receiver} — ${counts}${externalURL.length > 0 ? ` (${externalURL})` : ''}`;

  const attachments: SlackAttachment[] = alerts.slice(0, MAX_ATTACHMENTS).map(alert => ({
    color: isFiring(alert.state) ? SLACK_COLOR_FIRING : SLACK_COLOR_RESOLVED,
    title: alertTitle(alert),
    text: alertText(alert),
    fields: labelFields(alert.labels),
  }));

  if (alerts.length > MAX_ATTACHMENTS) {
    attachments.push({
      color: hasFiring ? SLACK_COLOR_FIRING : SLACK_COLOR_RESOLVED,
      title: `+${alerts.length - MAX_ATTACHMENTS} more alerts`,
      text: '',
      fields: [],
    });
  }

  const payload: SlackPayload = { text, attachments };
  if (opts.channel !== undefined && opts.channel.length > 0) payload.channel = opts.channel;
  if (opts.username !== undefined && opts.username.length > 0) payload.username = opts.username;
  return payload;
};
