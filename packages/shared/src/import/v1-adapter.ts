import type { ImportResult } from './types';

import { grafanaV1Schema } from '../schemas/grafana-v1';

import { importClassic } from './classic-adapter';

export const importV1 = (json: Record<string, unknown>): ImportResult => {
  const parsed = grafanaV1Schema.safeParse(json);
  if (!parsed.success) {
    const fallback = importClassic(json);
    return {
      dashboard: fallback.dashboard,
      warnings: ['V1 Resource JSON did not match expected schema — falling back to Classic parser', ...fallback.warnings],
    };
  }

  const { spec, metadata } = parsed.data;
  const specRecord: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    specRecord[key] = value;
  }

  const result = importClassic(specRecord);

  if (metadata.name !== '' && result.dashboard.title === 'Imported Dashboard') {
    result.dashboard.title = metadata.name;
  }

  return {
    dashboard: result.dashboard,
    warnings: result.warnings,
  };
};
