import type { ImportResult } from './types';

import { importClassic } from './classic-adapter';

export const importV1 = (json: Record<string, unknown>): ImportResult => {
  const warnings: string[] = [];

  if (!('spec' in json) || typeof json.spec !== 'object' || json.spec === null) {
    warnings.push('V1 Resource JSON missing "spec" field — attempting to parse as Classic');
    return { ...importClassic(json), warnings: [...warnings, ...importClassic(json).warnings] };
  }

  const specRecord = Object.fromEntries(Object.entries(json.spec));

  const result = importClassic(specRecord);

  if ('metadata' in json && typeof json.metadata === 'object' && json.metadata !== null) {
    const {metadata} = json;
    if ('name' in metadata && typeof metadata.name === 'string' && result.dashboard.title === 'Imported Dashboard') {
      result.dashboard.title = metadata.name;
    }
  }

  return {
    dashboard: result.dashboard,
    warnings: [...warnings, ...result.warnings],
  };
};
