import type { Panel } from '@graflare/shared/schemas/panel';

import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useCallback, useMemo } from 'react';

import { firstScalar, getThresholdColor } from './panel-data-extract';
import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface StatPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

export const StatPanel = ({ panel, timeRange, refetchInterval }: StatPanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(panel.datasourceId, panel.queries, timeRange, refetchInterval);

  // Latest scalar of the first series, kept as the raw token (stat displays the
  // string verbatim when it isn't numeric).
  const value = useMemo(() => firstScalar(data), [data]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const { defaults } = panel.fieldConfig;
  const numericValue = value === null ? Number.NaN : Number(value);
  const isNumeric = Number.isFinite(numericValue);
  const colorMode = panel.displayOptions.stat?.colorMode ?? 'value';
  const textSize = panel.displayOptions.stat?.textSize ?? 48;

  // One pass over the mappings; both the displayed text and the color derive from it.
  const mapping = useMemo(() => applyValueMappings(value, defaults.mappings), [value, defaults.mappings]);

  // Display: a matching mapping's text wins; else format numeric values; else keep
  // the raw Prometheus token (or em-dash) — never a formatted unit on a non-number.
  const displayText = mapping?.text ?? (isNumeric ? formatValue(numericValue, defaults) : (value ?? '—'));

  // Color precedence: mapping color > threshold color > default.
  const thresholdColor = isNumeric && panel.thresholds.length > 0 ? getThresholdColor(numericValue, panel.thresholds, 'var(--color-foreground)') : undefined;
  const effectiveColor = mapping?.color ?? thresholdColor;

  const valueStyle = useMemo(
    () => ({
      fontSize: `${String(textSize)}px`,
      color: colorMode === 'value' && effectiveColor !== undefined ? effectiveColor : undefined,
    }),
    [textSize, colorMode, effectiveColor],
  );

  const bgStyle = useMemo(() => {
    if (colorMode !== 'background' || effectiveColor === undefined) return;
    return { backgroundColor: effectiveColor, color: 'white' };
  }, [colorMode, effectiveColor]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      <output
        className='flex h-full items-center justify-center rounded'
        style={bgStyle}
        aria-label={`${panel.title}: ${value === null ? 'no data' : displayText}`}
      >
        <span className='font-semibold tabular-nums' style={valueStyle}>
          {value === null ? '—' : displayText}
        </span>
      </output>
    </PanelFrame>
  );
};
