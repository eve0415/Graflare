import type { StatusHistoryLane } from './status-history-data';
import type { ValueMapping } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Threshold } from '@graflare/shared/schemas/threshold';

import { useMemo } from 'react';

import { PanelFrame } from './panel-frame';
import { stateColor } from './state-color';
import { statusHistoryCells } from './status-history-data';
import { usePanelQuery } from './use-panel-query';

interface StatusHistoryPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
}

// Fallback display options when the panel hasn't persisted any (matches the schema
// defaults), so the renderer never reads `undefined` rowHeight/colWidth.
const DEFAULT_ROW_HEIGHT = 0.9;
const DEFAULT_COL_WIDTH = 0.9;

// Neutral slate for a state that matches neither a value mapping nor a threshold.
const FALLBACK_COLOR = '#64748b';

// SVG plot margins (internal user-units): room on the left for lane labels and on the
// bottom for time ticks. The viewBox scales the whole thing to the panel box.
const MARGIN = { top: 8, right: 8, bottom: 24, left: 96 };
const VIEW_W = 600;
const VIEW_H = 360;
// Cap so a sparse lane doesn't render absurdly wide boxes; the slot width is the lesser
// of the per-sample spacing and this cap.
const MAX_CELL_SLOT = 40;

// Format a time-axis tick. The x domain is unix seconds (Prometheus sample times), so a
// localized clock label reads better than the raw number a unit formatter would emit.
const formatTimeTick = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '';
  return new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// Domain of sample times across every lane (shared x-scale so lanes line up), plus the
// widest sample count in any lane (drives the cell slot width). Returns null when no
// cell exists (nothing to draw).
interface Layout {
  lo: number;
  hi: number;
  maxCells: number;
}
const layoutOf = (lanes: readonly StatusHistoryLane[]): Layout | null => {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let maxCells = 0;
  for (const lane of lanes) {
    maxCells = Math.max(maxCells, lane.cells.length);
    for (const cell of lane.cells) {
      lo = Math.min(lo, cell.time);
      hi = Math.max(hi, cell.time);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { lo, hi, maxCells };
};

interface StatusHistorySvgProps {
  lanes: StatusHistoryLane[];
  layout: Layout;
  thresholds: readonly Threshold[];
  mappings: readonly ValueMapping[];
  rowHeight: number;
  colWidth: number;
  label: string;
}

const StatusHistorySvg = ({ lanes, layout, thresholds, mappings, rowHeight, colWidth, label }: StatusHistorySvgProps) => {
  const plotW = VIEW_W - MARGIN.left - MARGIN.right;
  const plotH = VIEW_H - MARGIN.top - MARGIN.bottom;
  const laneH = plotH / Math.max(1, lanes.length);
  const bandH = laneH * rowHeight;
  const bandPad = (laneH - bandH) / 2;

  // Slot width per cell: spread the busiest lane's cells across the plot, capped so a
  // sparse lane stays readable. The drawn cell is `colWidth` of that slot, centered on
  // its time-x.
  const slot = Math.min(MAX_CELL_SLOT, plotW / Math.max(1, layout.maxCells));
  const cellW = slot * colWidth;

  // Map a sample time to its SVG x. A zero-width domain (every sample shares a time, or a
  // single sample) pins to the plot start so the cell still renders.
  const xPos = (t: number): number => (layout.hi === layout.lo ? MARGIN.left + plotW / 2 : MARGIN.left + ((t - layout.lo) / (layout.hi - layout.lo)) * plotW);

  // Three evenly spaced time ticks (start / mid / end); a degenerate domain shows one.
  const ticks = layout.hi === layout.lo ? [layout.lo] : [layout.lo, (layout.lo + layout.hi) / 2, layout.hi];

  return (
    // The grid is data-as-image: a <title> child plus aria-label give it an accessible
    // name so a screen reader announces the summary instead of a wall of <rect>s. No
    // explicit role='img' — jsx-a11y/prefer-tag-over-role rejects it on an <svg>, and a
    // named <svg> is already exposed as a graphic.
    <svg viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`} preserveAspectRatio='none' className='h-full w-full' aria-label={label}>
      <title>{label}</title>
      {lanes.map((lane, laneIndex) => {
        const y = MARGIN.top + laneIndex * laneH + bandPad;
        return (
          <g key={lane.label}>
            {lane.cells.map(cell => {
              const cx = xPos(cell.time);
              const fill = stateColor(String(cell.value), thresholds, mappings, FALLBACK_COLOR);
              return (
                <rect
                  key={`${lane.label}-${String(cell.time)}`}
                  className='gf-status-cell'
                  x={cx - cellW / 2}
                  y={y}
                  width={cellW}
                  height={bandH}
                  fill={fill}
                  rx={2}
                />
              );
            })}
            {/* Lane label, vertically centered on the band. */}
            <text x={MARGIN.left - 6} y={y + bandH / 2} textAnchor='end' dominantBaseline='central' className='fill-muted-foreground text-[11px]'>
              {lane.label}
            </text>
          </g>
        );
      })}
      {/* x-axis baseline + time ticks */}
      <line x1={MARGIN.left} y1={MARGIN.top + plotH} x2={MARGIN.left + plotW} y2={MARGIN.top + plotH} className='stroke-border' strokeWidth={1} />
      {ticks.map(t => (
        <text key={`xt-${String(t)}`} x={xPos(t)} y={VIEW_H - 8} textAnchor='middle' className='fill-muted-foreground text-[11px]'>
          {formatTimeTick(t)}
        </text>
      ))}
    </svg>
  );
};

export const StatusHistoryPanel = ({ panel, timeRange, refetchInterval }: StatusHistoryPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  const display = panel.displayOptions['status-history'];
  const rowHeight = display?.rowHeight ?? DEFAULT_ROW_HEIGHT;
  const colWidth = display?.colWidth ?? DEFAULT_COL_WIDTH;

  const { defaults } = panel.fieldConfig;
  const lanes = useMemo(() => statusHistoryCells(data, defaults), [data, defaults]);
  const layout = useMemo(() => layoutOf(lanes), [lanes]);

  // Accessible name for the grid-as-image: series count, so screen-reader users get a
  // summary of an otherwise visual-only chart.
  const label = useMemo(() => `Status history, ${String(lanes.length)} series`, [lanes.length]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      {layout === null ? (
        <p className='text-muted-foreground text-sm'>No data</p>
      ) : (
        <StatusHistorySvg
          lanes={lanes}
          layout={layout}
          thresholds={panel.thresholds}
          mappings={defaults.mappings}
          rowHeight={rowHeight}
          colWidth={colWidth}
          label={label}
        />
      )}
    </PanelFrame>
  );
};
