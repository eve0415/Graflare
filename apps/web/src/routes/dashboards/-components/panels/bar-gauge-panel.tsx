import type { BarGaugeSegment } from './bar-gauge-data';
import type { Panel } from '@graflare/shared/schemas/panel';

import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useMemo } from 'react';

import { barGaugeSegments } from './bar-gauge-data';
import { getThresholdColor } from './panel-data-extract';
import { PanelFrame } from './panel-frame';
import { usePanelQuery } from './use-panel-query';

interface BarGaugePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

const DEFAULT_BAR_COLOR = '#4ade80';
const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;

interface BarGaugeRowProps {
  segment: BarGaugeSegment;
  thresholds: { value: number; color: string }[];
  vertical: boolean;
}

const BarGaugeRow = ({ segment, thresholds, vertical }: BarGaugeRowProps) => {
  // The series' own resolved config drives its unit/decimals/mappings and meter range,
  // so a per-field override changes only the matched bar. With no override this is the
  // panel defaults reference (byte-identical to before).
  const { config } = segment;
  const min = config.min ?? DEFAULT_MIN;
  const max = config.max ?? DEFAULT_MAX;

  // Mapping text/colour wins over the formatted value and threshold colour,
  // matching the stat panel's precedence.
  const mapping = useMemo(() => applyValueMappings(segment.value, config.mappings), [segment.value, config.mappings]);
  const displayText = mapping?.text ?? formatValue(segment.value, config);
  const fillColor = mapping?.color ?? (thresholds.length > 0 ? getThresholdColor(segment.value, thresholds, DEFAULT_BAR_COLOR) : DEFAULT_BAR_COLOR);

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
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  // Each bar resolves its own range/unit/mappings inside the helper (keyed on the series
  // label it derives), so per-field overrides apply per bar. With no overrides every
  // series resolves to the panel defaults — byte-identical to before.
  const { fieldConfig } = panel;
  const vertical = panel.displayOptions.bargauge?.orientation === 'vertical';

  const segments = useMemo(() => barGaugeSegments(data, fieldConfig), [data, fieldConfig]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      {segments.length > 0 ? (
        <div className={vertical ? 'flex h-full items-end justify-around gap-3 p-2' : 'flex h-full flex-col justify-center gap-2 p-1'}>
          {segments.map((segment, i) => (
            <BarGaugeRow key={`${segment.label}-${String(i)}`} segment={segment} thresholds={panel.thresholds} vertical={vertical} />
          ))}
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>No data</p>
      )}
    </PanelFrame>
  );
};
