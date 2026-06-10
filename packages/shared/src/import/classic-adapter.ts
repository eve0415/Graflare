import type { GrafanaBasePanel, GrafanaPanel, GrafanaVariable } from '../schemas/grafana-classic';
import type { Panel, PanelQuery } from '../schemas/panel';
import type { TimeRange } from '../schemas/time-range';
import type { Variable } from '../schemas/variable';
import type { ImportResult } from './types';

import { grafanaClassicSchema } from '../schemas/grafana-classic';

import { mapOverrides } from './override-mapping';
import { mapTransformations } from './transformation-mapping';
import { mapAdhocFilters, resolveVariableType, splitCsv } from './variable-mapping';

const PANEL_TYPE_MAP: Record<string, string> = {
  graph: 'timeseries',
  timeseries: 'timeseries',
  singlestat: 'stat',
  stat: 'stat',
  table: 'table',
  'table-old': 'table',
  gauge: 'gauge',
  bargauge: 'bargauge',
  barchart: 'barchart',
  piechart: 'pie',
  histogram: 'histogram',
  heatmap: 'heatmap',
  'state-timeline': 'state-timeline',
  'status-history': 'status-history',
  text: 'text',
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

// Grafana's text panel `mode` is one of code/text/html/markdown. We only render
// markdown or sanitized html, so anything that isn't explicitly 'html' becomes
// 'markdown' (the safe default — html still goes through rehype-sanitize).
const clampTextMode = (mode: string): 'markdown' | 'html' => (mode === 'html' ? 'html' : 'markdown');

const mapQueries = (targets: GrafanaPanel['targets'], baseIndex: number): PanelQuery[] =>
  targets.map((t, i) => ({
    refId: t.refId || String.fromCodePoint(65 + baseIndex + i),
    expr: t.expr,
    legendFormat: t.legendFormat,
    format: 'time_series',
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

// Grafana's repeatDirection is 'h'|'v' at runtime but a free string in stored JSON; anything
// that isn't explicitly 'v' lays out horizontally (Grafana's own default).
const clampRepeatDirection = (dir: string): 'h' | 'v' => (dir === 'v' ? 'v' : 'h');

// maxPerRow is a free number in stored JSON; our schema wants an int in 1–24. Non-finite junk
// (JSON can't encode it, but be defensive) falls back to the runtime default 4.
const clampMaxPerRow = (n: number): number => (Number.isFinite(n) ? Math.min(24, Math.max(1, Math.round(n))) : 4);

const mapVariable = (v: GrafanaVariable, warnings: string[]): Variable | null => {
  if (v.name === '') return null;

  const type = resolveVariableType(v.type, v.name, warnings);

  const query = typeof v.query === 'string' ? v.query : '';
  const enumerated = v.options.map(o => o.value);
  // Grafana interval variables list their steps in the comma-separated `query`;
  // fall back to that when `options` isn't enumerated so the choices survive import.
  const options = type === 'interval' && enumerated.length === 0 ? splitCsv(query) : enumerated;
  // Adhoc variables carry their label matchers in `filters[]`; every other type has none. The
  // datasource isn't mapped here (Grafana's classic datasource ref doesn't resolve to a Graflare
  // datasource id), so an imported adhoc variable is scoped from the editor before it injects.
  const filters = type === 'adhoc' ? mapAdhocFilters(v.filters, v.name, warnings) : [];

  return {
    name: v.name,
    type,
    label: v.label ?? '',
    query,
    regex: v.regex,
    sort: 'disabled',
    multi: v.multi,
    includeAll: v.includeAll,
    // A multi/include-all selection arrives as an array; our `current` is string | string[],
    // so it carries through as-is (the old CSV-join predates multi-value support).
    current: v.current.value,
    // Grafana's custom All value, verbatim; null/absent means "expand over the option list".
    allValue: v.allValue ?? '',
    options,
    filters,
  };
};

const convertPanel = (gp: GrafanaBasePanel, index: number, warnings: string[]): Panel | null => {
  // A panel carrying `repeatPanelId` is a legacy BAKED repeat clone (old Grafana persisted the
  // expanded instances into the dashboard JSON). Importing it would duplicate the source panel,
  // which imports with its own `repeat` and re-expands at render time — so skip the clone.
  if (gp.repeatPanelId !== undefined) {
    warnings.push(`Skipped legacy repeat clone of panel ${String(gp.repeatPanelId)}`);
    return null;
  }

  const mapped = PANEL_TYPE_MAP[gp.type] ?? gp.type;
  const supported = SUPPORTED_TYPES.has(mapped);

  if (!supported) {
    warnings.push(`Unsupported panel type "${gp.type}" (panel "${gp.title || `Panel ${String(index)}`}") — converted to placeholder stat panel`);
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
  ) {
    return null;
  }

  // Text panels carry their content in displayOptions.text (mapped from Grafana's
  // `options.content` + `options.mode`); every other type imports with empty options.
  const displayOptions: Panel['displayOptions'] =
    panelType === 'text' ? { text: { content: gp.options?.content ?? '', mode: clampTextMode(gp.options?.mode ?? 'markdown') } } : {};

  const panel: Panel = {
    id: `panel-${String(index)}`,
    type: panelType,
    title: gp.title,
    description: gp.description,
    queries: mapQueries(gp.targets, 0),
    gridPos: clampGridPos(gp.gridPos),
    thresholds: mapThresholds(gp.fieldConfig),
    displayOptions,
    // Defaults stay empty (consistent with thresholds being lifted to panel.thresholds); only
    // per-field overrides are carried across, warn-dropping matchers/properties we can't model.
    fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: mapOverrides(gp.fieldConfig.overrides, warnings) },
    // Data transformations, warn-dropping any transform id/option we don't model (same honest-loss
    // approach as the overrides above).
    transformations: mapTransformations(gp.transformations, warnings),
    repeatDirection: clampRepeatDirection(gp.repeatDirection),
    maxPerRow: clampMaxPerRow(gp.maxPerRow),
  };
  // `repeat` is optional on our schema (exactOptionalPropertyTypes): only a real variable name
  // is set; Grafana's null/'' "no repeat" leaves the key off entirely.
  if (gp.repeat !== null && gp.repeat !== '') panel.repeat = gp.repeat;
  return panel;
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
      // Graflare has no row concept (rows flatten into their panels), so a repeating row can't
      // be modeled — warn-drop the repetition but keep the nested panels.
      if (gp.repeat !== null && gp.repeat !== '') {
        warnings.push(`Row repetition is not supported — row "${gp.title}" was flattened`);
      }
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
    const mapped = mapVariable(v, warnings);
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
