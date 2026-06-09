import type { StateTimelineLane } from './state-timeline-data';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Threshold } from '@graflare/shared/schemas/threshold';

import { useMemo } from 'react';

import { PanelFrame } from './panel-frame';
import { stateColor } from './state-color';
import { stateTimelineLanes } from './state-timeline-data';
import { usePanelQuery } from './use-panel-query';

interface StateTimelinePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
}

// Fallback display options when the panel hasn't persisted any (matches the schema
// defaults), so the renderer never reads `undefined` rowHeight/showValue.
const DEFAULT_ROW_HEIGHT = 0.9;
const DEFAULT_SHOW_VALUE: 'auto' | 'always' | 'never' = 'auto';

// Neutral slate for a state that matches neither a value mapping nor a threshold.
const FALLBACK_COLOR = '#64748b';

// SVG plot margins (internal user-units): room on the left for lane labels and on the
// bottom for time ticks. The viewBox scales the whole thing to the panel box.
const MARGIN = { top: 8, right: 8, bottom: 24, left: 96 };
const VIEW_W = 600;
const VIEW_H = 360;
// Below this lane height (user-units) a value label won't fit, so 'auto' hides it.
const AUTO_LABEL_MIN_LANE_H = 18;
// Approximate glyph width (user-units) for the same display text, used to skip labels
// that would overflow their segment.
const APPROX_CHAR_W = 6.5;

// Format a time-axis tick. The x domain is unix seconds (Prometheus sample times), so a
// localized clock label reads better than the raw number a unit formatter would emit.
const formatTimeTick = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '';
  return new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// Min/max sample time across every lane's segments, so all lanes share one x-scale and
// line up in time. Returns null when no segment exists (nothing to draw).
const timeDomain = (lanes: readonly StateTimelineLane[]): { lo: number; hi: number } | null => {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const lane of lanes) {
    for (const seg of lane.segments) {
      lo = Math.min(lo, seg.startTime);
      hi = Math.max(hi, seg.endTime);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { lo, hi };
};

interface StateTimelineSvgProps {
  lanes: StateTimelineLane[];
  domain: { lo: number; hi: number };
  thresholds: readonly Threshold[];
  rowHeight: number;
  showValue: 'auto' | 'always' | 'never';
  label: string;
}

const StateTimelineSvg = ({ lanes, domain, thresholds, rowHeight, showValue, label }: StateTimelineSvgProps) => {
  const plotW = VIEW_W - MARGIN.left - MARGIN.right;
  const plotH = VIEW_H - MARGIN.top - MARGIN.bottom;
  const laneH = plotH / Math.max(1, lanes.length);
  const bandH = laneH * rowHeight;
  const bandPad = (laneH - bandH) / 2;

  // Map a sample time to its SVG x. A zero-width domain (every sample shares a time)
  // pins to the plot start so a single-sample series still renders a visible band.
  const xPos = (t: number): number => (domain.hi === domain.lo ? MARGIN.left : MARGIN.left + ((t - domain.lo) / (domain.hi - domain.lo)) * plotW);
  // A zero-width segment (its run is a single sample, or the whole domain is degenerate)
  // gets a small minimum width so it never collapses to an invisible 0-px rect.
  const MIN_SEG_W = 2;

  // Three evenly spaced time ticks (start / mid / end); a degenerate domain shows one.
  const ticks = domain.hi === domain.lo ? [domain.lo] : [domain.lo, (domain.lo + domain.hi) / 2, domain.hi];

  return (
    // The timeline is data-as-image: a <title> child plus aria-label give it an
    // accessible name so a screen reader announces the summary instead of a wall of
    // <rect>s. No explicit role='img' — jsx-a11y/prefer-tag-over-role rejects it on an
    // <svg>, and a named <svg> is already exposed as a graphic.
    <svg viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`} preserveAspectRatio='none' className='h-full w-full' aria-label={label}>
      <title>{label}</title>
      {lanes.map((lane, laneIndex) => {
        const y = MARGIN.top + laneIndex * laneH + bandPad;
        const showLabel = showValue === 'always' || (showValue === 'auto' && bandH >= AUTO_LABEL_MIN_LANE_H);
        return (
          // Suffix the key with the lane index: two series sharing a `__name__` resolve to the
          // same label, so the label alone is not a unique key (React "same key" warning).
          <g key={`${lane.label}-${String(laneIndex)}`}>
            {lane.segments.map(seg => {
              const x = xPos(seg.startTime);
              const w = Math.max(MIN_SEG_W, xPos(seg.endTime) - x);
              // The lane's own resolved mappings drive the colour, so a per-field
              // mappings override recolours only the matched lane.
              const fill = stateColor(String(seg.value), thresholds, lane.config.mappings, FALLBACK_COLOR);
              const fits = showLabel && w >= seg.displayValue.length * APPROX_CHAR_W;
              return (
                <g key={`${lane.label}-${String(seg.startTime)}`}>
                  <rect className='gf-state-segment' x={x} y={y} width={w} height={bandH} fill={fill} rx={2} />
                  {fits && (
                    <text x={x + w / 2} y={y + bandH / 2} textAnchor='middle' dominantBaseline='central' className='fill-background text-[10px] font-medium'>
                      {seg.displayValue}
                    </text>
                  )}
                </g>
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

export const StateTimelinePanel = ({ panel, timeRange, refetchInterval }: StateTimelinePanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  const display = panel.displayOptions['state-timeline'];
  const rowHeight = display?.rowHeight ?? DEFAULT_ROW_HEIGHT;
  const showValue = display?.showValue ?? DEFAULT_SHOW_VALUE;

  // Each lane resolves its own config (per-field overrides) keyed on its label and the query
  // refId, inside the helper. With no overrides every lane resolves to the panel defaults
  // reference — byte-identical formatting and colour to before.
  const { fieldConfig, queries, transformations } = panel;
  const lanes = useMemo(() => stateTimelineLanes(data, fieldConfig, queries, transformations), [data, fieldConfig, queries, transformations]);
  const domain = useMemo(() => timeDomain(lanes), [lanes]);

  // Accessible name for the timeline-as-image: series count, so screen-reader users get
  // a summary of an otherwise visual-only chart.
  const label = useMemo(() => `State timeline, ${String(lanes.length)} series`, [lanes.length]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      {domain === null ? (
        <p className='text-muted-foreground text-sm'>No data</p>
      ) : (
        <StateTimelineSvg lanes={lanes} domain={domain} thresholds={panel.thresholds} rowHeight={rowHeight} showValue={showValue} label={label} />
      )}
    </PanelFrame>
  );
};
