import type { GrafanaBasePanel, GrafanaPanel, GrafanaVariable } from '../schemas/grafana-classic';
import type { Panel, PanelQuery } from '../schemas/panel';
import type { TimeRange } from '../schemas/time-range';
import type { Variable } from '../schemas/variable';
import type { ImportResult } from './types';

import { grafanaClassicSchema } from '../schemas/grafana-classic';

const PANEL_TYPE_MAP: Record<string, string> = {
  graph: 'timeseries',
  timeseries: 'timeseries',
  singlestat: 'stat',
  stat: 'stat',
  table: 'table',
  'table-old': 'table',
  gauge: 'gauge',
  bargauge: 'gauge',
};

const SUPPORTED_TYPES = new Set(['timeseries', 'stat', 'table', 'gauge']);

const mapQueries = (targets: GrafanaPanel['targets'], baseIndex: number): PanelQuery[] =>
  targets.map((t, i) => ({
    refId: t.refId || String.fromCodePoint(65 + baseIndex + i),
    expr: t.expr,
    legendFormat: t.legendFormat,
  }));

const clampGridPos = (gp: GrafanaPanel['gridPos']) => ({
  x: Math.max(0, Math.min(23, Math.round(gp.x))),
  y: Math.max(0, Math.round(gp.y)),
  w: Math.max(1, Math.min(24, Math.round(gp.w))),
  h: Math.max(1, Math.min(100, Math.round(gp.h))),
});

const mapThresholds = (fc: GrafanaPanel['fieldConfig']) =>
  fc.defaults.thresholds.steps.map(s => ({
    value: s.value ?? 0,
    color: s.color,
  }));

const mapVariable = (v: GrafanaVariable): Variable | null => {
  if (v.name === '') return null;

  let type: 'query' | 'custom' | 'constant' = 'custom';
  if (v.type === 'query') type = 'query';
  else if (v.type === 'constant') type = 'constant';

  const query = typeof v.query === 'string' ? v.query : '';
  const currentValue = typeof v.current.value === 'string' ? v.current.value : Array.isArray(v.current.value) ? v.current.value.join(',') : '';

  return {
    name: v.name,
    type,
    label: v.label ?? '',
    query,
    regex: v.regex,
    sort: 'disabled',
    multi: v.multi,
    includeAll: v.includeAll,
    current: currentValue,
    options: v.options.map(o => o.value),
  };
};

const convertPanel = (gp: GrafanaBasePanel, index: number, warnings: string[]): Panel | null => {
  const mapped = PANEL_TYPE_MAP[gp.type] ?? gp.type;
  const supported = SUPPORTED_TYPES.has(mapped);

  if (!supported) {
    warnings.push(`Unsupported panel type "${gp.type}" (panel "${gp.title || `Panel ${String(index)}`}") — converted to placeholder stat panel`);
  }

  const panelType = supported ? mapped : 'stat';
  if (panelType !== 'timeseries' && panelType !== 'stat' && panelType !== 'table' && panelType !== 'gauge') {
    return null;
  }

  return {
    id: `panel-${String(index)}`,
    type: panelType,
    title: gp.title,
    description: gp.description,
    queries: mapQueries(gp.targets, 0),
    gridPos: clampGridPos(gp.gridPos),
    thresholds: mapThresholds(gp.fieldConfig),
    displayOptions: {},
  };
};

export const importClassic = (json: Record<string, unknown>): ImportResult => {
  const parsed = grafanaClassicSchema.safeParse(json);
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
      warnings: ['Failed to parse Grafana Classic JSON — dashboard may be in an unsupported format'],
    };
  }

  const d = parsed.data;
  const warnings: string[] = [];

  const panels: Panel[] = [];
  for (const gp of d.panels) {
    if (gp.type === 'row') {
      for (const nested of gp.panels) {
        const panel = convertPanel(nested, panels.length, warnings);
        if (panel !== null) panels.push(panel);
      }
      continue;
    }

    const panel = convertPanel(gp, panels.length, warnings);
    if (panel !== null) panels.push(panel);
  }

  const variables: Variable[] = [];
  for (const v of d.templating.list) {
    const mapped = mapVariable(v);
    if (mapped !== null) variables.push(mapped);
  }

  const timeRange: TimeRange = {
    from: d.time.from,
    to: d.time.to,
    refresh: null,
  };

  return {
    dashboard: {
      title: d.title,
      description: d.description,
      tags: d.tags,
      panels,
      variables,
      timeRange,
    },
    warnings,
  };
};
