import type { GridPos, Panel, PanelQuery } from '../schemas/panel';
import type { TimeRange } from '../schemas/time-range';
import type { Variable } from '../schemas/variable';
import type { ImportResult } from './types';

const toRecord = (v: unknown): Record<string, unknown> | null => {
  if (typeof v !== 'object' || v === null) return null;
  return Object.fromEntries(Object.entries(v));
};

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

const mapPanelType = (type: string): { mapped: string; supported: boolean } => {
  const mapped = PANEL_TYPE_MAP[type] ?? type;
  return { mapped, supported: SUPPORTED_TYPES.has(mapped) };
};

const extractQueries = (targets: unknown): PanelQuery[] => {
  if (!Array.isArray(targets)) return [];

  const queries: PanelQuery[] = [];
  for (const raw of targets) {
    const t = toRecord(raw);
    if (t === null) continue;

    const refId = typeof t.refId === 'string' ? t.refId : String.fromCodePoint(65 + queries.length);
    const expr = typeof t.expr === 'string' ? t.expr : '';
    const legendFormat = typeof t.legendFormat === 'string' ? t.legendFormat : '';

    queries.push({ refId, expr, legendFormat });
  }
  return queries;
};

const extractGridPos = (gp: unknown): GridPos => {
  if (typeof gp !== 'object' || gp === null) {
    return { x: 0, y: 0, w: 12, h: 8 };
  }

  const r = Object.fromEntries(Object.entries(gp));
  const x = typeof r.x === 'number' ? Math.max(0, Math.min(23, r.x)) : 0;
  const y = typeof r.y === 'number' ? Math.max(0, r.y) : 0;
  const w = typeof r.w === 'number' ? Math.max(1, Math.min(24, r.w)) : 12;
  const h = typeof r.h === 'number' ? Math.max(1, Math.min(100, r.h)) : 8;

  return { x, y, w, h };
};

const extractThresholds = (fieldConfig: unknown): { value: number; color: string }[] => {
  const fc = toRecord(fieldConfig);
  if (fc === null) return [];
  const defs = toRecord(fc.defaults);
  if (defs === null) return [];
  const th = toRecord(defs.thresholds);
  if (th === null) return [];
  if (!Array.isArray(th.steps)) return [];

  const result: { value: number; color: string }[] = [];
  for (const raw of th.steps) {
    const step = toRecord(raw);
    if (step === null) continue;
    const value = typeof step.value === 'number' ? step.value : 0;
    const color = typeof step.color === 'string' ? step.color : 'green';
    result.push({ value, color });
  }
  return result;
};

const extractVariables = (templating: unknown): Variable[] => {
  const t = toRecord(templating);
  if (t === null) return [];
  if (!Array.isArray(t.list)) return [];

  const variables: Variable[] = [];
  for (const raw of t.list) {
    const v = toRecord(raw);
    if (v === null) continue;

    const name = typeof v.name === 'string' ? v.name : '';
    if (name === '') continue;

    let type: 'query' | 'custom' | 'constant' = 'custom';
    if (typeof v.type === 'string') {
      if (v.type === 'query') type = 'query';
      else if (v.type === 'constant') type = 'constant';
    }

    const label = typeof v.label === 'string' ? v.label : '';
    const query = typeof v.query === 'string' ? v.query : '';
    const regex = typeof v.regex === 'string' ? v.regex : '';
    const multi = typeof v.multi === 'boolean' ? v.multi : false;
    const includeAll = typeof v.includeAll === 'boolean' ? v.includeAll : false;

    let current = '';
    const cur = toRecord(v.current);
    if (cur !== null && typeof cur.value === 'string') {
      current = cur.value;
    }

    let options: string[] = [];
    if (Array.isArray(v.options)) {
      options = [];
      for (const raw2 of v.options) {
        const o = toRecord(raw2);
        if (o !== null && typeof o.value === 'string') {
          options.push(o.value);
        }
      }
    }

    variables.push({ name, type, label, query, regex, sort: 'disabled', multi, includeAll, current, options });
  }
  return variables;
};

const extractTimeRange = (time: unknown): TimeRange => {
  const t = toRecord(time);
  if (t === null) {
    return { from: 'now-1h', to: 'now', refresh: null };
  }

  const from = typeof t.from === 'string' ? t.from : 'now-1h';
  const to = typeof t.to === 'string' ? t.to : 'now';

  return { from, to, refresh: null };
};

export const importClassic = (json: Record<string, unknown>): ImportResult => {
  const warnings: string[] = [];

  const title = typeof json.title === 'string' ? json.title : 'Imported Dashboard';
  const description = typeof json.description === 'string' ? json.description : '';
  const tags = Array.isArray(json.tags) ? json.tags.filter((t): t is string => typeof t === 'string') : [];

  const panels: Panel[] = [];
  if (Array.isArray(json.panels)) {
    for (const raw of json.panels) {
      const p = toRecord(raw);
      if (p === null) continue;

      if (p.type === 'row') {
        if (Array.isArray(p.panels)) {
          for (const nestedRaw of p.panels) {
            const nested = toRecord(nestedRaw);
            if (nested === null) continue;
            const nestedPanel = convertPanel(nested, panels.length, warnings);
            if (nestedPanel !== null) panels.push(nestedPanel);
          }
        }
        continue;
      }

      const panel = convertPanel(p, panels.length, warnings);
      if (panel !== null) panels.push(panel);
    }
  }

  const variables = extractVariables(json.templating);
  const timeRange = extractTimeRange(json.time);

  return {
    dashboard: { title, description, tags, panels, variables, timeRange },
    warnings,
  };
};

const convertPanel = (p: Record<string, unknown>, index: number, warnings: string[]): Panel | null => {
  const rawType = typeof p.type === 'string' ? p.type : 'unknown';
  const { mapped, supported } = mapPanelType(rawType);

  if (!supported) {
    const panelTitle = typeof p.title === 'string' ? p.title : `Panel ${String(index)}`;
    warnings.push(`Unsupported panel type "${rawType}" (panel "${panelTitle}") — converted to placeholder stat panel`);
  }

  const panelType = supported ? mapped : 'stat';
  if (panelType !== 'timeseries' && panelType !== 'stat' && panelType !== 'table' && panelType !== 'gauge') {
    return null;
  }

  const panelTitle = typeof p.title === 'string' ? p.title : '';
  const panelDesc = typeof p.description === 'string' ? p.description : '';
  const queries = extractQueries(p.targets);
  const gridPos = extractGridPos(p.gridPos);
  const thresholds = extractThresholds(p.fieldConfig);

  return {
    id: `panel-${String(index)}`,
    type: panelType,
    title: panelTitle,
    description: panelDesc,
    queries,
    gridPos,
    thresholds,
    displayOptions: {},
  };
};
