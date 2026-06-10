import type { Panel } from '@graflare/shared/schemas/panel';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';
import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useMemo } from 'react';

import { extractTransformedSeriesWithQuery, firstScalar, getThresholdColor, seriesDescriptor } from './panel-data-extract';
import { PanelFrame } from './panel-frame';
import { usePanelQuery } from './use-panel-query';

interface GaugePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

/** Round away float dust (sin/cos of right angles) so path strings stay exact. */
const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Arc on the TOP semicircle of a dial centered at (100,100): −90° is the left end (min),
 * 0° is 12 o'clock, +90° is the right end (max) — x from sin, y from −cos. (A plain
 * cos/sin mapping puts −90° at 12 o'clock and draws the right half-circle, half of it
 * below the 200×130 viewBox.)
 */
export const describeArc = (startAngle: number, endAngle: number, radius: number): string => {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const cx = 100;
  const cy = 100;
  const x1 = cx + radius * Math.sin(startRad);
  const y1 = cy - radius * Math.cos(startRad);
  const x2 = cx + radius * Math.sin(endRad);
  const y2 = cy - radius * Math.cos(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${fmt(x1)} ${fmt(y1)} A ${String(radius)} ${String(radius)} 0 ${String(largeArc)} 1 ${fmt(x2)} ${fmt(y2)}`;
};

export const GaugePanel = ({ panel, timeRange, refetchInterval }: GaugePanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  // Latest scalar of the first series (after the panel transformations) as a number; a non-numeric
  // token coerces to NaN (preserved downstream, where the gauge clamps/normalizes it).
  const value = useMemo(() => {
    const raw = firstScalar(data, panel.transformations);
    return raw === null ? null : Number(raw);
  }, [data, panel.transformations]);

  // Gauge shows a single value field (the first series); resolve its effective config
  // against the panel overrides through the shared `seriesDescriptor` — the single home for
  // the gauge range (min/max), unit and mappings, matched by the SAME derived label (and
  // query refId) every per-series panel keys on. With no series the descriptor name is ''
  // (the no-data path is unchanged); with no matching override this returns the defaults
  // reference, so the memo deps stay reference-stable.
  const { fieldConfig, queries, transformations } = panel;
  const config = useMemo(() => {
    const [first] = extractTransformedSeriesWithQuery(data, queries, transformations);
    const descriptor = first === undefined ? { name: '' } : seriesDescriptor(first.series, 0, first.refId);
    return resolveFieldConfig(descriptor, fieldConfig);
  }, [data, queries, transformations, fieldConfig]);

  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const showMarkers = panel.displayOptions.gauge?.showThresholdMarkers !== false;

  const normalizedValue = value === null ? min : Math.max(min, Math.min(max, value));
  const percentage = (normalizedValue - min) / (max - min);
  const angle = -90 + percentage * 180;

  // One pass over the mappings feeds both the center readout text and its color.
  const mapping = useMemo(() => applyValueMappings(value, config.mappings), [value, config.mappings]);
  const centerText = mapping?.text ?? (value === null ? '—' : formatValue(value, config));
  const minLabel = formatValue(min, config);
  const maxLabel = formatValue(max, config);

  const thresholdColor = mapping?.color ?? (value !== null && panel.thresholds.length > 0 ? getThresholdColor(value, panel.thresholds, '#4ade80') : '#4ade80');

  const arcs = useMemo(() => {
    if (panel.thresholds.length === 0 || !showMarkers) {
      return [{ start: -90, end: 90, color: '#e5e7eb' }];
    }

    const sorted = [...panel.thresholds].sort((a, b) => a.value - b.value);
    const segments: { start: number; end: number; color: string }[] = [];
    let prevAngle = -90;

    for (const t of sorted) {
      const tPercentage = Math.max(0, Math.min(1, (t.value - min) / (max - min)));
      const tAngle = -90 + tPercentage * 180;
      if (tAngle > prevAngle) {
        segments.push({ start: prevAngle, end: tAngle, color: t.color });
        prevAngle = tAngle;
      }
    }

    if (prevAngle < 90) {
      const lastColor = sorted.at(-1)?.color ?? '#4ade80';
      segments.push({ start: prevAngle, end: 90, color: lastColor });
    }

    return segments;
  }, [panel.thresholds, showMarkers, min, max]);

  return (
    <PanelFrame
      title={panel.title}
      panelId={panel.id}
      repeat={panel.repeat}
      loading={isLoading}
      error={error instanceof Error ? error.message : null}
      onRetry={handleRetry}
    >
      {/* NOT a native <meter>: children of <meter> are fallback content and never render in
          modern browsers, so the SVG arc was invisible behind the UA meter bar. A div with
          role='meter' renders the SVG and keeps the semantics (the role requires
          aria-valuenow, so it and the value attributes are only set when a value exists). */}
      <div
        role={value === null ? undefined : 'meter'}
        aria-valuemin={value === null ? undefined : min}
        aria-valuemax={value === null ? undefined : max}
        aria-valuenow={value === null ? undefined : normalizedValue}
        className='flex h-full flex-col items-center justify-center'
        aria-label={`${panel.title}: ${value === null ? 'no data' : centerText}`}
      >
        <svg viewBox='0 0 200 130' className='w-full max-w-48'>
          {arcs.map((arc, i) => (
            <path key={String(i)} d={describeArc(arc.start, arc.end, 80)} fill='none' stroke={arc.color} strokeWidth='12' strokeLinecap='round' opacity={0.3} />
          ))}
          {value !== null && <path d={describeArc(-90, angle, 80)} fill='none' stroke={thresholdColor} strokeWidth='12' strokeLinecap='round' />}
          {/* When there's no value this reads as a bare em-dash; the gauge's
              aria-label already says "no data", so hide the sentinel glyph. */}
          <text x='100' y='105' textAnchor='middle' className='fill-foreground text-2xl font-semibold' aria-hidden={value === null ? true : undefined}>
            {centerText}
          </text>
          <text x='20' y='125' textAnchor='middle' className='fill-muted-foreground text-xs'>
            {minLabel}
          </text>
          <text x='180' y='125' textAnchor='middle' className='fill-muted-foreground text-xs'>
            {maxLabel}
          </text>
        </svg>
      </div>
    </PanelFrame>
  );
};
