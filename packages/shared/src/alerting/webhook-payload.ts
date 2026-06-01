export interface WebhookAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  values: Record<string, number>;
  generatorURL: string;
  fingerprint: string;
}

export interface GrafanaWebhookPayload {
  status: 'firing' | 'resolved';
  alerts: WebhookAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  receiver: string;
}

export interface AlertForPayload {
  state: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  value: string;
  activeAt: number | null;
  resolvedAt?: number | null;
  fingerprint: string;
  generatorURL: string;
}

export function buildWebhookPayload(
  alerts: AlertForPayload[],
  receiver: string,
  externalURL: string,
): GrafanaWebhookPayload {
  const webhookAlerts: WebhookAlert[] = alerts.map(a => ({
    status: a.state === 'Firing' ? 'firing' : 'resolved',
    labels: a.labels,
    annotations: a.annotations,
    startsAt: a.activeAt !== null ? new Date(a.activeAt).toISOString() : '',
    endsAt: a.resolvedAt !== null && a.resolvedAt !== undefined ? new Date(a.resolvedAt).toISOString() : '',
    values: { value: Number.parseFloat(a.value) || 0 },
    generatorURL: a.generatorURL,
    fingerprint: a.fingerprint,
  }));

  const hasFiring = webhookAlerts.some(a => a.status === 'firing');

  const commonLabels = alerts.length > 0 ? computeCommon(alerts.map(a => a.labels)) : {};
  const commonAnnotations = alerts.length > 0 ? computeCommon(alerts.map(a => a.annotations)) : {};
  const groupLabels = commonLabels;

  return {
    status: hasFiring ? 'firing' : 'resolved',
    alerts: webhookAlerts,
    groupLabels,
    commonLabels,
    commonAnnotations,
    externalURL,
    receiver,
  };
}

function computeCommon(maps: Record<string, string>[]): Record<string, string> {
  if (maps.length === 0) return {};
  const result: Record<string, string> = {};
  const first = maps[0];
  for (const [key, value] of Object.entries(first)) {
    if (maps.every(m => m[key] === value)) {
      result[key] = value;
    }
  }
  return result;
}
