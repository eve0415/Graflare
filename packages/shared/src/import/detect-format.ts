import type { GrafanaFormat } from './types';

export const detectFormat = (json: Record<string, unknown>): GrafanaFormat => {
  if (
    'apiVersion' in json &&
    typeof json.apiVersion === 'string'
  ) {
    if (json.apiVersion.startsWith('dashboard.grafana.app/v2')) {
      return 'v2';
    }
    if ('kind' in json && json.kind === 'Dashboard') {
      return 'v1';
    }
  }

  return 'classic';
};
