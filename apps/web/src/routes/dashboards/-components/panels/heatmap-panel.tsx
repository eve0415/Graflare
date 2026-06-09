import type { HeatmapScheme } from './heatmap-color';
import type { HeatmapGrid } from './heatmap-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { formatValue } from '@graflare/shared/format/value-format';
import { useMemo } from 'react';

import { heatColor } from './heatmap-color';
import { heatmapGrid, heatmapSamples } from './heatmap-data';
import { PanelFrame } from './panel-frame';
import { usePanelQuery } from './use-panel-query';

interface HeatmapPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
}

// Fallback display options when the panel hasn't persisted any (matches the schema
// defaults). Kept here so the renderer never reads `undefined` buckets/scheme.
const DEFAULT_X_BUCKETS = 20;
const DEFAULT_Y_BUCKETS = 10;
const DEFAULT_SCHEME: HeatmapScheme = 'blues';

// SVG plot margins (internal user-units): room on the left for value labels and on the
// bottom for time labels. The viewBox scales the whole thing to the panel box.
const MARGIN = { top: 8, right: 8, bottom: 28, left: 56 };
const VIEW_W = 600;
const VIEW_H = 360;

// Edges arrays are `count + 1` long; the bucket count is one less, and at least 1 (a
// degenerate axis collapses to a [min, min] pair -> one bucket).
const bucketCount = (edges: number[]): number => Math.max(1, edges.length - 1);

// Format a time-axis tick. The x domain is unix seconds (Prometheus sample times), so a
// localized clock label reads better than the raw number a unit formatter would emit.
const formatTimeTick = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '';
  return new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// Three evenly spaced tick positions (start / mid / end) along an axis whose edges span
// [edges[0], edges.at(-1)]. Returns the domain values; the caller formats + places them.
const axisTicks = (edges: number[]): number[] => {
  const [lo] = edges;
  const hi = edges.at(-1);
  if (lo === undefined || hi === undefined) return [];
  if (hi === lo) return [lo];
  return [lo, (lo + hi) / 2, hi];
};

interface HeatmapSvgProps {
  grid: HeatmapGrid;
  scheme: HeatmapScheme;
  defaults: FieldConfigDefaults;
  label: string;
}

const HeatmapSvg = ({ grid, scheme, defaults, label }: HeatmapSvgProps) => {
  const nx = bucketCount(grid.xEdges);
  const ny = bucketCount(grid.yEdges);

  const plotW = VIEW_W - MARGIN.left - MARGIN.right;
  const plotH = VIEW_H - MARGIN.top - MARGIN.bottom;
  const cellW = plotW / nx;
  const cellH = plotH / ny;

  // A tiny inset keeps adjacent cells visually distinct without leaving gaps in the
  // grid; clamped so very small cells don't invert.
  const gap = Math.min(1, cellW / 8, cellH / 8);

  const xTicks = axisTicks(grid.xEdges);
  const yTicks = axisTicks(grid.yEdges);

  const xDomain = { lo: grid.xEdges[0] ?? 0, hi: grid.xEdges.at(-1) ?? 0 };
  const yDomain = { lo: grid.yEdges[0] ?? 0, hi: grid.yEdges.at(-1) ?? 0 };

  // Map a domain value to its SVG coordinate. A zero-width domain pins to the axis
  // start so a degenerate axis still renders its single tick.
  const xPos = (v: number): number => (xDomain.hi === xDomain.lo ? MARGIN.left : MARGIN.left + ((v - xDomain.lo) / (xDomain.hi - xDomain.lo)) * plotW);
  const yPos = (v: number): number =>
    yDomain.hi === yDomain.lo ? MARGIN.top + plotH : MARGIN.top + plotH - ((v - yDomain.lo) / (yDomain.hi - yDomain.lo)) * plotH;

  return (
    // The grid is data-as-image: a <title> child plus aria-label give it an accessible
    // name so a screen reader announces the summary instead of a wall of <rect>s. No
    // explicit role='img' — that trips jsx-a11y/prefer-tag-over-role, and an <svg> with
    // an accessible name is already exposed as a graphic; the name is what matters.
    <svg viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`} preserveAspectRatio='none' className='h-full w-full' aria-label={label}>
      <title>{label}</title>
      {grid.cells.map(cell => {
        // y bucket 0 is the lowest value, so it sits at the BOTTOM of the plot: invert
        // the row index against the plot height.
        const x = MARGIN.left + cell.x * cellW;
        const y = MARGIN.top + (ny - 1 - cell.y) * cellH;
        const t = grid.maxCount > 0 ? cell.count / grid.maxCount : 0;
        return (
          <rect
            key={`${String(cell.x)}-${String(cell.y)}`}
            x={x + gap}
            y={y + gap}
            width={Math.max(0, cellW - gap * 2)}
            height={Math.max(0, cellH - gap * 2)}
            fill={heatColor(t, scheme)}
          />
        );
      })}
      {/* Axis baselines */}
      <line x1={MARGIN.left} y1={MARGIN.top + plotH} x2={MARGIN.left + plotW} y2={MARGIN.top + plotH} className='stroke-border' strokeWidth={1} />
      <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + plotH} className='stroke-border' strokeWidth={1} />
      {xTicks.map(v => (
        <text key={`xt-${String(v)}`} x={xPos(v)} y={VIEW_H - 8} textAnchor='middle' className='fill-muted-foreground text-[11px]'>
          {formatTimeTick(v)}
        </text>
      ))}
      {yTicks.map(v => (
        <text key={`yt-${String(v)}`} x={MARGIN.left - 6} y={yPos(v)} textAnchor='end' dominantBaseline='middle' className='fill-muted-foreground text-[11px]'>
          {formatValue(v, defaults)}
        </text>
      ))}
    </svg>
  );
};

export const HeatmapPanel = ({ panel, timeRange, refetchInterval }: HeatmapPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  const display = panel.displayOptions.heatmap;
  const xBuckets = display?.xBuckets ?? DEFAULT_X_BUCKETS;
  const yBuckets = display?.yBuckets ?? DEFAULT_Y_BUCKETS;
  const scheme = display?.colorScheme ?? DEFAULT_SCHEME;

  const grid = useMemo(
    () => heatmapGrid(heatmapSamples(data, panel.transformations), { xBuckets, yBuckets }),
    [data, panel.transformations, xBuckets, yBuckets],
  );

  // Accessible name for the grid-as-image: cell count + peak density, so screen-reader
  // users get a summary of an otherwise visual-only chart.
  const label = useMemo(() => `Heatmap, ${String(grid.cells.length)} cells, peak ${String(grid.maxCount)}`, [grid.cells.length, grid.maxCount]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      {grid.maxCount > 0 ? (
        <HeatmapSvg grid={grid} scheme={scheme} defaults={panel.fieldConfig.defaults} label={label} />
      ) : (
        <p className='text-muted-foreground text-sm'>No data</p>
      )}
    </PanelFrame>
  );
};
