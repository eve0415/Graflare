import type { V2Element, V2Variable } from '../schemas/grafana-v2';
import type { Panel, PanelQuery } from '../schemas/panel';
import type { TimeRange } from '../schemas/time-range';
import type { Variable } from '../schemas/variable';
import type { ImportResult } from './types';

import { grafanaV2Schema } from '../schemas/grafana-v2';

const SUPPORTED_TYPES = new Set(['timeseries', 'stat', 'table', 'gauge']);

const mapV2Queries = (el: V2Element): PanelQuery[] =>
  el.spec.data.queries.map((q, i) => ({
    refId: q.refId || String.fromCodePoint(65 + i),
    expr: q.expr,
    legendFormat: q.legendFormat,
    format: 'time_series',
  }));

const mapV2Variable = (v: V2Variable): Variable | null => {
  if (v.name === '') return null;

  let type: 'query' | 'custom' | 'constant' = 'custom';
  if (v.type === 'query') type = 'query';
  else if (v.type === 'constant') type = 'constant';

  return {
    name: v.name,
    type,
    label: v.label,
    query: v.query,
    regex: '',
    sort: 'disabled',
    multi: v.multi,
    includeAll: v.includeAll,
    current: '',
    options: [],
  };
};

export const importV2 = (json: Record<string, unknown>): ImportResult => {
  const parsed = grafanaV2Schema.safeParse(json);
  if (!parsed.success) {
    return {
      dashboard: {
        title: 'Imported Dashboard',
        description: '',
        tags: [],
        panels: [],
        variables: [],
        timeRange: { from: 'now-1h', to: 'now', refresh: null },
      },
      warnings: ['Failed to parse Grafana V2 Resource JSON'],
    };
  }

  const { metadata, spec } = parsed.data;
  const warnings: string[] = [];

  const title = spec.title || metadata.name || 'Imported Dashboard';
  const { description } = spec;
  const tags = Object.entries(metadata.labels).map(([k, v]) => `${k}:${v}`);

  const layoutMap = new Map(spec.layout.items.map(item => [item.element, item]));

  const panels: Panel[] = [];
  let panelIndex = 0;
  for (const [key, element] of Object.entries(spec.elements)) {
    const rawType = element.kind.toLowerCase();
    const supported = SUPPORTED_TYPES.has(rawType);

    if (!supported) {
      warnings.push(`Unsupported panel type "${element.kind}" (element "${key}") — converted to placeholder stat panel`);
    }

    const panelType = supported ? rawType : 'stat';
    if (panelType !== 'timeseries' && panelType !== 'stat' && panelType !== 'table' && panelType !== 'gauge') continue;

    const layoutItem = layoutMap.get(key);
    const gridPos = {
      x: Math.max(0, Math.min(23, Math.round(layoutItem?.x ?? 0))),
      y: Math.max(0, Math.round(layoutItem?.y ?? panelIndex * 8)),
      w: Math.max(1, Math.min(24, Math.round(layoutItem?.width ?? 12))),
      h: Math.max(1, Math.min(100, Math.round(layoutItem?.height ?? 8))),
    };

    panels.push({
      id: `panel-${String(panelIndex)}`,
      type: panelType,
      title: element.spec.title || key,
      description: '',
      queries: mapV2Queries(element),
      gridPos,
      thresholds: [],
      displayOptions: {},
      fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
    });

    panelIndex += 1;
  }

  const variables: Variable[] = [];
  for (const v of spec.variables) {
    const mapped = mapV2Variable(v);
    if (mapped !== null) variables.push(mapped);
  }

  const timeRange: TimeRange = { from: 'now-1h', to: 'now', refresh: null };

  return {
    dashboard: { title, description, tags, panels, variables, timeRange },
    warnings,
  };
};
