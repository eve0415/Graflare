import type { V2Element, V2Variable } from '../schemas/grafana-v2';
import type { Panel, PanelQuery } from '../schemas/panel';
import type { TimeRange } from '../schemas/time-range';
import type { Variable } from '../schemas/variable';
import type { ImportResult } from './types';

import { grafanaV2Schema } from '../schemas/grafana-v2';

import { resolveVariableType, splitCsv } from './variable-mapping';

// Grafana V2 element kinds whose lowercased name differs from our internal panel
// type. Identity is assumed for the rest (e.g. `barchart` → `barchart`), so only the
// exceptions live here, mirroring the classic adapter's PANEL_TYPE_MAP.
const PANEL_KIND_MAP: Record<string, string> = {
  piechart: 'pie',
  // V2 kinds are PascalCase single tokens, so `StateTimeline`/`StatusHistory` lowercase
  // to `statetimeline`/`statushistory` — the hyphen in our internal id is lost. Map them
  // back explicitly (the identity fallback can't recover a hyphen). Mirrors `piechart →
  // pie`.
  statetimeline: 'state-timeline',
  statushistory: 'status-history',
};

const SUPPORTED_TYPES = new Set([
  'timeseries',
  'stat',
  'table',
  'gauge',
  'bargauge',
  'barchart',
  'pie',
  'histogram',
  'heatmap',
  'state-timeline',
  'status-history',
  'text',
]);

// Grafana's text panel `mode` is one of code/text/html/markdown; we render only markdown
// or sanitized html, so anything other than 'html' clamps to 'markdown'. Mirrors the
// classic adapter.
const clampTextMode = (mode: string): 'markdown' | 'html' => (mode === 'html' ? 'html' : 'markdown');

const mapV2Queries = (el: V2Element): PanelQuery[] =>
  el.spec.data.queries.map((q, i) => ({
    refId: q.refId || String.fromCodePoint(65 + i),
    expr: q.expr,
    legendFormat: q.legendFormat,
    format: 'time_series',
  }));

const mapV2Variable = (v: V2Variable, warnings: string[]): Variable | null => {
  if (v.name === '') return null;

  const type = resolveVariableType(v.type, v.name, warnings);
  // V2 variables carry no enumerated options, so interval steps come from the
  // comma-separated query.
  const options = type === 'interval' ? splitCsv(v.query) : [];

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
    options,
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
    const mapped = PANEL_KIND_MAP[element.kind.toLowerCase()] ?? element.kind.toLowerCase();
    const supported = SUPPORTED_TYPES.has(mapped);

    if (!supported) {
      warnings.push(`Unsupported panel type "${element.kind}" (element "${key}") — converted to placeholder stat panel`);
    }

    const panelType = supported ? mapped : 'stat';
    if (
      panelType !== 'timeseries' &&
      panelType !== 'stat' &&
      panelType !== 'table' &&
      panelType !== 'gauge' &&
      panelType !== 'bargauge' &&
      panelType !== 'barchart' &&
      panelType !== 'pie' &&
      panelType !== 'histogram' &&
      panelType !== 'heatmap' &&
      panelType !== 'state-timeline' &&
      panelType !== 'status-history' &&
      panelType !== 'text'
    )
      continue;

    const layoutItem = layoutMap.get(key);
    const gridPos = {
      x: Math.max(0, Math.min(23, Math.round(layoutItem?.x ?? 0))),
      y: Math.max(0, Math.round(layoutItem?.y ?? panelIndex * 8)),
      w: Math.max(1, Math.min(24, Math.round(layoutItem?.width ?? 12))),
      h: Math.max(1, Math.min(100, Math.round(layoutItem?.height ?? 8))),
    };

    // Text panels carry content in displayOptions.text (from the element's
    // `options.content` + `options.mode`); other types import with empty options.
    const displayOptions: Panel['displayOptions'] =
      panelType === 'text' ? { text: { content: element.spec.options?.content ?? '', mode: clampTextMode(element.spec.options?.mode ?? 'markdown') } } : {};

    panels.push({
      id: `panel-${String(panelIndex)}`,
      type: panelType,
      title: element.spec.title || key,
      description: '',
      queries: mapV2Queries(element),
      gridPos,
      thresholds: [],
      displayOptions,
      fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
    });

    panelIndex += 1;
  }

  const variables: Variable[] = [];
  for (const v of spec.variables) {
    const mapped = mapV2Variable(v, warnings);
    if (mapped !== null) variables.push(mapped);
  }

  const timeRange: TimeRange = { from: 'now-1h', to: 'now', refresh: null };

  return {
    dashboard: { title, description, tags, panels, variables, timeRange },
    warnings,
  };
};
