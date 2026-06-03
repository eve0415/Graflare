import type { Panel } from '@graflare/shared/schemas/panel';

import { useCallback, useMemo } from 'react';

import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface GaugePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

const describeArc = (startAngle: number, endAngle: number, radius: number): string => {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const cx = 100;
  const cy = 100;
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${String(x1)} ${String(y1)} A ${String(radius)} ${String(radius)} 0 ${String(largeArc)} 1 ${String(x2)} ${String(y2)}`;
};

const getThresholdColor = (value: number, thresholds: { value: number; color: string }[]): string => {
  const sorted = [...thresholds].sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return '#4ade80';
};

export const GaugePanel = ({ panel, timeRange, refetchInterval }: GaugePanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(
    panel.datasourceId,
    panel.queries,
    timeRange,
    refetchInterval,
  );

  const value = useMemo(() => {
    if (data === null || data === undefined) return null;

    for (const res of data) {
      if (!('status' in res)) continue;
      if (res.status !== 'success' || res.data === undefined || !('result' in res.data)) continue;
      const results = res.data.result;
      if (!Array.isArray(results) || results.length === 0) continue;
      const [first] = results;
      if (typeof first !== 'object' || first === null) continue;
      if ('value' in first && Array.isArray(first.value) && first.value.length >= 2) {
        return Number(first.value[1]);
      }
      if ('values' in first && Array.isArray(first.values) && first.values.length > 0) {
        const last = first.values.at(-1);
        if (Array.isArray(last) && last.length >= 2) return Number(last[1]);
      }
    }
    return null;
  }, [data]);

  const min = panel.displayOptions.gauge?.min ?? 0;
  const max = panel.displayOptions.gauge?.max ?? 100;
  const showMarkers = panel.displayOptions.gauge?.showThresholdMarkers !== false;

  const normalizedValue = value === null ? min : Math.max(min, Math.min(max, value));
  const percentage = (normalizedValue - min) / (max - min);
  const angle = -90 + percentage * 180;

  const handleRetry = useCallback(() => { void refetch(); }, [refetch]);

  const thresholdColor = value !== null && panel.thresholds.length > 0
    ? getThresholdColor(value, panel.thresholds)
    : '#4ade80';

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
      loading={isLoading}
      error={error instanceof Error ? error.message : null}
      onRetry={handleRetry}
    >
      <meter
        className='flex h-full flex-col items-center justify-center appearance-none [&::-webkit-meter-bar]:bg-transparent [&::-webkit-meter-optimum-value]:bg-transparent'
        min={min}
        max={max}
        value={value ?? undefined}
        aria-label={`${panel.title}: ${value === null ? 'no data' : String(value)}`}
      >
        <svg viewBox='0 0 200 130' className='w-full max-w-48'>
          {arcs.map((arc, i) => (
            <path
              key={String(i)}
              d={describeArc(arc.start, arc.end, 80)}
              fill='none'
              stroke={arc.color}
              strokeWidth='12'
              strokeLinecap='round'
              opacity={0.3}
            />
          ))}
          {value !== null && (
            <path
              d={describeArc(-90, angle, 80)}
              fill='none'
              stroke={thresholdColor}
              strokeWidth='12'
              strokeLinecap='round'
            />
          )}
          <text x='100' y='105' textAnchor='middle' className='fill-foreground text-2xl font-semibold'>
            {value === null ? '—' : String(Math.round(value * 100) / 100)}
          </text>
          <text x='20' y='125' textAnchor='middle' className='fill-muted-foreground text-xs'>
            {String(min)}
          </text>
          <text x='180' y='125' textAnchor='middle' className='fill-muted-foreground text-xs'>
            {String(max)}
          </text>
        </svg>
      </meter>
    </PanelFrame>
  );
};
