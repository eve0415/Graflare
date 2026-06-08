import type { Panel } from '@graflare/shared/schemas/panel';

import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useCallback, useMemo } from 'react';

import { PanelFrame } from './panel-frame';
import { usePanelData } from './use-panel-data';

interface StatPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

const getThresholdColor = (value: number, thresholds: { value: number; color: string }[]): string => {
  const sorted = [...thresholds].sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return 'var(--color-foreground)';
};

export const StatPanel = ({ panel, timeRange, refetchInterval }: StatPanelProps) => {
  const { data, isLoading, error, refetch } = usePanelData(panel.datasourceId, panel.queries, timeRange, refetchInterval);

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
        return String(first.value[1]);
      }
      if ('values' in first && Array.isArray(first.values) && first.values.length > 0) {
        const last = first.values.at(-1);
        if (Array.isArray(last) && last.length >= 2) return String(last[1]);
      }
    }
    return null;
  }, [data]);

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
  const thresholdColor = isNumeric && panel.thresholds.length > 0 ? getThresholdColor(numericValue, panel.thresholds) : undefined;
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
