import type { GridPos, Panel, PanelQuery } from '../schemas/panel';
import type { TimeRange } from '../schemas/time-range';
import type { Variable } from '../schemas/variable';
import type { ImportResult } from './types';

const toRecord = (v: unknown): Record<string, unknown> | null => {
  if (typeof v !== 'object' || v === null) return null;
  return Object.fromEntries(Object.entries(v));
};

const extractV2Queries = (element: Record<string, unknown>): PanelQuery[] => {
  const queries: PanelQuery[] = [];

  const spec = toRecord(element.spec);
  if (spec === null) return queries;

  const data = toRecord(spec.data);
  if (data === null) return queries;

  if (!Array.isArray(data.queries)) return queries;

  for (const raw of data.queries) {
    const q = toRecord(raw);
    if (q === null) continue;
    const refId = typeof q.refId === 'string' ? q.refId : String.fromCodePoint(65 + queries.length);
    const expr = typeof q.expr === 'string' ? q.expr : '';
    const legendFormat = typeof q.legendFormat === 'string' ? q.legendFormat : '';
    queries.push({ refId, expr, legendFormat });
  }

  return queries;
};

const extractV2GridPos = (layout: unknown, index: number): GridPos => {
  const r = toRecord(layout);
  if (r === null) {
    return { x: 0, y: index * 8, w: 12, h: 8 };
  }

  const x = typeof r.x === 'number' ? Math.max(0, Math.min(23, r.x)) : 0;
  const y = typeof r.y === 'number' ? Math.max(0, r.y) : index * 8;
  const w = typeof r.width === 'number' ? Math.max(1, Math.min(24, r.width)) : 12;
  const h = typeof r.height === 'number' ? Math.max(1, Math.min(100, r.height)) : 8;

  return { x, y, w, h };
};

const SUPPORTED_TYPES = new Set(['timeseries', 'stat', 'table', 'gauge']);

export const importV2 = (json: Record<string, unknown>): ImportResult => {
  const warnings: string[] = [];
  const panels: Panel[] = [];
  const variables: Variable[] = [];

  let title = 'Imported Dashboard';
  let description = '';
  const tags: string[] = [];

  const metadata = toRecord(json.metadata);
  if (metadata !== null) {
    if (typeof metadata.name === 'string') title = metadata.name;
    const labels = toRecord(metadata.labels);
    if (labels !== null) {
      for (const [k, v] of Object.entries(labels)) {
        tags.push(`${k}:${String(v)}`);
      }
    }
  }

  const spec = toRecord(json.spec);
  if (spec !== null) {
    if (typeof spec.title === 'string') ({ title } = spec);
    if (typeof spec.description === 'string') ({ description } = spec);

    const elements = toRecord(spec.elements);
    if (elements !== null) {
      const layout = toRecord(spec.layout);

      const layoutItems = new Map<string, Record<string, unknown>>();
      if (layout !== null && Array.isArray(layout.items)) {
        for (const raw of layout.items) {
          const item = toRecord(raw);
          if (item !== null && typeof item.element === 'string') {
            layoutItems.set(item.element, item);
          }
        }
      }

      let panelIndex = 0;
      for (const [key, elementRaw] of Object.entries(elements)) {
        const elementRecord = toRecord(elementRaw);
        if (elementRecord === null) continue;

        const rawType = typeof elementRecord.kind === 'string'
          ? elementRecord.kind.toLowerCase()
          : 'unknown';

        if (!SUPPORTED_TYPES.has(rawType)) {
          warnings.push(`Unsupported panel type "${rawType}" (element "${key}") — converted to placeholder stat panel`);
        }

        const panelType = SUPPORTED_TYPES.has(rawType) ? rawType : 'stat';
        if (panelType !== 'timeseries' && panelType !== 'stat' && panelType !== 'table' && panelType !== 'gauge') continue;

        let panelTitle = key;
        const elSpec = toRecord(elementRecord.spec);
        if (elSpec !== null && typeof elSpec.title === 'string') {
          panelTitle = elSpec.title;
        }

        const queries = extractV2Queries(elementRecord);
        const gridPos = extractV2GridPos(layoutItems.get(key), panelIndex);

        panels.push({
          id: `panel-${String(panelIndex)}`,
          type: panelType,
          title: panelTitle,
          description: '',
          queries,
          gridPos,
          thresholds: [],
          displayOptions: {},
        });

        panelIndex += 1;
      }
    }

    if (Array.isArray(spec.variables)) {
      for (const raw of spec.variables) {
        const v = toRecord(raw);
        if (v === null) continue;

        const name = typeof v.name === 'string' ? v.name : '';
        if (name === '') continue;

        let type: 'query' | 'custom' | 'constant' = 'custom';
        if (typeof v.type === 'string') {
          if (v.type === 'query') type = 'query';
          else if (v.type === 'constant') type = 'constant';
        }

        variables.push({
          name,
          type,
          label: typeof v.label === 'string' ? v.label : '',
          query: typeof v.query === 'string' ? v.query : '',
          regex: '',
          sort: 'disabled',
          multi: typeof v.multi === 'boolean' ? v.multi : false,
          includeAll: typeof v.includeAll === 'boolean' ? v.includeAll : false,
          current: '',
          options: [],
        });
      }
    }
  }

  const timeRange: TimeRange = { from: 'now-1h', to: 'now', refresh: null };

  return {
    dashboard: { title, description, tags, panels, variables, timeRange },
    warnings,
  };
};
