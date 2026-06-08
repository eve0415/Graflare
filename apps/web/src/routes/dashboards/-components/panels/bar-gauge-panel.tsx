import type { BarGaugeSegment } from './bar-gauge-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';
import type { Panel } from '@graflare/shared/schemas/panel';

import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useCallback, useMemo } from 'react';

import { barGaugeSegments } from './bar-gauge-data';
import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface BarGaugePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

const DEFAULT_BAR_COLOR = '#4ade80';

const getThresholdColor = (value: number, thresholds: { value: number; color: string }[]): string => {
  const sorted = [...thresholds].sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return DEFAULT_BAR_COLOR;
};

interface BarGaugeRowProps {
  segment: BarGaugeSegment;
  min: number;
  max: number;
  defaults: FieldConfigDefaults;
  thresholds: { value: number; color: string }[];
  vertical: boolean;
}

const BarGaugeRow = ({ segment, min, max, defaults, thresholds, vertical }: BarGaugeRowProps) => {
  // Mapping text/colour wins over the formatted value and threshold colour,
  // matching the stat panel's precedence.
  const mapping = useMemo(() => applyValueMappings(segment.value, defaults.mappings), [segment.value, defaults.mappings]);
  const displayText = mapping?.text ?? formatValue(segment.value, defaults);
  const fillColor = mapping?.color ?? (thresholds.length > 0 ? getThresholdColor(segment.value, thresholds) : DEFAULT_BAR_COLOR);

  // The coloured fill is layered over a `<meter>` whose own bar is made
  // transparent (same trick as gauge-panel), so the threshold colour shows while
  // the element keeps native meter semantics (value/min/max for assistive tech).
  const fillStyle = useMemo(() => {
    const pct = `${String(segment.fraction * 100)}%`;
    return vertical
      ? { height: pct, width: '100%', backgroundColor: fillColor, bottom: 0, position: 'absolute' as const }
      : { width: pct, height: '100%', backgroundColor: fillColor, left: 0, position: 'absolute' as const };
  }, [segment.fraction, fillColor, vertical]);

  const label = `${segment.label}: ${displayText}`;
  const meterClass =
    'relative block appearance-none overflow-hidden rounded bg-muted [&::-webkit-meter-bar]:bg-transparent [&::-webkit-meter-optimum-value]:bg-transparent';

  return (
    <div className={vertical ? 'flex h-full flex-1 flex-col items-center gap-1' : 'flex items-center gap-2'}>
      <span
        className={vertical ? 'text-muted-foreground order-3 max-w-full truncate text-xs' : 'text-muted-foreground w-24 shrink-0 truncate text-xs'}
        title={segment.label}
      >
        {segment.label}
      </span>
      <meter aria-label={label} min={min} max={max} value={segment.value} className={vertical ? `${meterClass} h-full w-6` : `${meterClass} h-5 flex-1`}>
        <span style={fillStyle} />
      </meter>
      <span className={vertical ? 'text-xs font-medium tabular-nums' : 'w-16 shrink-0 text-right text-xs font-medium tabular-nums'}>{displayText}</span>
    </div>
  );
};

export const BarGaugePanel = ({ panel, timeRange, refetchInterval }: BarGaugePanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(panel.datasourceId, panel.queries, timeRange, refetchInterval);

  // Field config is the single home for the range, mirroring the gauge panel.
  const { defaults } = panel.fieldConfig;
  const min = defaults.min ?? 0;
  const max = defaults.max ?? 100;
  const vertical = panel.displayOptions.bargauge?.orientation === 'vertical';

  const segments = useMemo(() => barGaugeSegments(data, min, max), [data, min, max]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      {segments.length > 0 ? (
        <div className={vertical ? 'flex h-full items-end justify-around gap-3 p-2' : 'flex h-full flex-col justify-center gap-2 p-1'}>
          {segments.map((segment, i) => (
            <BarGaugeRow
              key={`${segment.label}-${String(i)}`}
              segment={segment}
              min={min}
              max={max}
              defaults={defaults}
              thresholds={panel.thresholds}
              vertical={vertical}
            />
          ))}
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>No data</p>
      )}
    </PanelFrame>
  );
};
