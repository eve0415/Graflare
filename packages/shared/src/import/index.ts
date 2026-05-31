import type { GrafanaFormat, ImportResult } from './types';

import { importClassic } from './classic-adapter';
import { detectFormat } from './detect-format';
import { importV1 } from './v1-adapter';
import { importV2 } from './v2-adapter';

export type { GrafanaFormat, ImportResult, ImportedDashboard } from './types';
export { detectFormat } from './detect-format';
export { importClassic } from './classic-adapter';
export { importV1 } from './v1-adapter';
export { importV2 } from './v2-adapter';

export const importDashboard = (json: Record<string, unknown>, format?: GrafanaFormat): ImportResult => {
  const detected = format ?? detectFormat(json);

  switch (detected) {
    case 'v1': return importV1(json);
    case 'v2': return importV2(json);
    case 'classic': return importClassic(json);
  }
};
