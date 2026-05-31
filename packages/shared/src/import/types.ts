import type { Panel } from '../schemas/panel';
import type { TimeRange } from '../schemas/time-range';
import type { Variable } from '../schemas/variable';

export type GrafanaFormat = 'classic' | 'v1' | 'v2';

export interface ImportedDashboard {
  title: string;
  description: string;
  tags: string[];
  panels: Panel[];
  variables: Variable[];
  timeRange: TimeRange;
}

export interface ImportResult {
  dashboard: ImportedDashboard;
  warnings: string[];
}
