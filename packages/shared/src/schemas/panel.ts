import * as z from 'zod/mini';

import { fieldConfigSchema } from './field-config';
import { thresholdsSchema } from './threshold';

export const panelTypeSchema = z.enum(['timeseries', 'stat', 'table', 'gauge', 'bargauge', 'barchart', 'pie', 'histogram', 'heatmap', 'text']);

export type PanelType = z.infer<typeof panelTypeSchema>;

export const panelQuerySchema = z.object({
  refId: z.string().check(z.minLength(1), z.maxLength(8)),
  expr: z.string().check(z.maxLength(65536)),
  legendFormat: z._default(z.string().check(z.maxLength(512)), ''),
  format: z._default(z.enum(['time_series', 'table']), 'time_series'),
});

export type PanelQuery = z.infer<typeof panelQuerySchema>;

export const gridPosSchema = z.object({
  x: z.int().check(z.minimum(0), z.maximum(23)),
  y: z.int().check(z.minimum(0)),
  w: z.int().check(z.minimum(1), z.maximum(24)),
  h: z.int().check(z.minimum(1), z.maximum(100)),
});

export type GridPos = z.infer<typeof gridPosSchema>;

export const timeseriesDisplaySchema = z.object({
  lineWidth: z._default(z.int().check(z.minimum(0), z.maximum(10)), 1),
  fillOpacity: z._default(z.int().check(z.minimum(0), z.maximum(100)), 10),
  pointSize: z._default(z.int().check(z.minimum(0), z.maximum(40)), 5),
  stackMode: z._default(z.enum(['none', 'normal', 'percent']), 'none'),
  showPoints: z._default(z.enum(['auto', 'always', 'never']), 'auto'),
});

export type TimeseriesDisplay = z.infer<typeof timeseriesDisplaySchema>;

export const statDisplaySchema = z.object({
  valueField: z._default(z.string(), ''),
  colorMode: z._default(z.enum(['value', 'background', 'none']), 'value'),
  textSize: z._default(z.int().check(z.minimum(8), z.maximum(200)), 48),
  sparkline: z._default(z.boolean(), false),
});

export type StatDisplay = z.infer<typeof statDisplaySchema>;

export const tableDisplaySchema = z.object({
  columnVisibility: z._default(z.record(z.string(), z.boolean()), {}),
  cellDisplayMode: z._default(z.enum(['auto', 'color-text', 'color-background', 'gauge']), 'auto'),
});

export type TableDisplay = z.infer<typeof tableDisplaySchema>;

export const gaugeDisplaySchema = z.object({
  min: z._default(z.number(), 0),
  max: z._default(z.number(), 100),
  showThresholdMarkers: z._default(z.boolean(), true),
  orientation: z._default(z.enum(['horizontal', 'vertical']), 'horizontal'),
});

export type GaugeDisplay = z.infer<typeof gaugeDisplaySchema>;

// Bar gauge: one labelled bar per series, filled by (value-min)/(max-min). min/max
// live in fieldConfig.defaults (the shared single home), so they're absent here.
// displayMode mirrors Grafana's basic/gradient/lcd fills; kept minimal + defaulted.
export const barGaugeDisplaySchema = z.object({
  orientation: z._default(z.enum(['horizontal', 'vertical']), 'horizontal'),
  displayMode: z._default(z.enum(['basic', 'gradient', 'lcd']), 'gradient'),
});

export type BarGaugeDisplay = z.infer<typeof barGaugeDisplaySchema>;

// Bar chart: categorical/time bars via uPlot's bars path-builder. Minimal +
// defaulted; stacking maps to uPlot bands, orientation to the axis swap.
export const barChartDisplaySchema = z.object({
  orientation: z._default(z.enum(['horizontal', 'vertical']), 'vertical'),
  stacking: z._default(z.enum(['none', 'normal']), 'none'),
});

export type BarChartDisplay = z.infer<typeof barChartDisplaySchema>;

// Pie chart: one slice per series, sized by its latest value's share of the total.
// `display` toggles the solid pie vs a centre-punched donut; `legend` places (or
// hides) the label/value list. Minimal + defaulted, mirroring the other panels.
export const pieDisplaySchema = z.object({
  display: z._default(z.enum(['pie', 'donut']), 'pie'),
  legend: z._default(z.enum(['right', 'bottom', 'none']), 'right'),
});

export type PieDisplay = z.infer<typeof pieDisplaySchema>;

// Histogram: buckets the distribution of every sample (all series, all points) into
// equal-width bins. `bucketCount` drives the bin count when no explicit `bucketSize`
// is set; `bucketSize` (optional) pins the bin width instead. Minimal + defaulted.
export const histogramDisplaySchema = z.object({
  bucketCount: z._default(z.int().check(z.minimum(1), z.maximum(100)), 20),
  bucketSize: z.optional(z.number()),
});

export type HistogramDisplay = z.infer<typeof histogramDisplaySchema>;

// Heatmap: a 2D density grid (x = time buckets, y = value buckets, cell = sample
// count). `xBuckets`/`yBuckets` size the grid; `colorScheme` picks the cell color ramp.
// Minimal + defaulted, mirroring the other panels — extra controls (axis scaling, fixed
// domains) can be added as further defaulted keys without breaking stored panels.
export const heatmapDisplaySchema = z.object({
  xBuckets: z._default(z.int().check(z.minimum(2), z.maximum(200)), 20),
  yBuckets: z._default(z.int().check(z.minimum(2), z.maximum(100)), 10),
  colorScheme: z._default(z.enum(['blues', 'greens', 'reds', 'turbo']), 'blues'),
});

export type HeatmapDisplay = z.infer<typeof heatmapDisplaySchema>;

// Text: author-written panel content with no data query. `content` holds the source
// string (Markdown, or HTML when `mode` is 'html'); `mode` selects how it is parsed.
// Both are rendered through react-markdown with rehype-sanitize ON, so author HTML is
// XSS-stripped, never injected raw. Minimal + defaulted, mirroring the other panels.
export const textDisplaySchema = z.object({
  content: z._default(z.string().check(z.maxLength(16384)), ''),
  mode: z._default(z.enum(['markdown', 'html']), 'markdown'),
});

export type TextDisplay = z.infer<typeof textDisplaySchema>;

export const displayOptionsSchema = z.object({
  timeseries: z.optional(timeseriesDisplaySchema),
  stat: z.optional(statDisplaySchema),
  table: z.optional(tableDisplaySchema),
  gauge: z.optional(gaugeDisplaySchema),
  bargauge: z.optional(barGaugeDisplaySchema),
  barchart: z.optional(barChartDisplaySchema),
  pie: z.optional(pieDisplaySchema),
  histogram: z.optional(histogramDisplaySchema),
  heatmap: z.optional(heatmapDisplaySchema),
  text: z.optional(textDisplaySchema),
});

export type DisplayOptions = z.infer<typeof displayOptionsSchema>;

export const panelSchema = z.object({
  id: z.string().check(z.minLength(1), z.maxLength(64)),
  type: panelTypeSchema,
  title: z.string().check(z.maxLength(512)),
  datasourceId: z.optional(z.uuid()),
  queries: z._default(z.array(panelQuerySchema), []),
  gridPos: gridPosSchema,
  thresholds: z._default(thresholdsSchema, []),
  displayOptions: z._default(displayOptionsSchema, {}),
  fieldConfig: z._default(fieldConfigSchema, { defaults: { unit: '', mappings: [] }, overrides: [] }),
  description: z._default(z.string().check(z.maxLength(2048)), ''),
});

export type Panel = z.infer<typeof panelSchema>;
