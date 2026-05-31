import type { Panel } from '@graflare/shared/schemas/panel';

import { useMemo } from 'react';

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
  const { data, isLoading, error, refetch } = usePanelData(
    panel.datasourceId,
    panel.queries,
    timeRange,
    refetchInterval,
  );

  const value = useMemo(() => {
    if (data === null || data === undefined) return null;

    for (const res of data) {
      if (res.status !== 'success' || res.data === undefined || !('result' in res.data)) continue;
      const results = res.data.result;
      if (!Array.isArray(results) || results.length === 0) continue;
      const first = results[0];
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

  const numericValue = value !== null ? Number(value) : 0;
  const colorMode = panel.displayOptions.stat?.colorMode ?? 'value';
  const textSize = panel.displayOptions.stat?.textSize ?? 48;
  const thresholdColor = panel.thresholds.length > 0
    ? getThresholdColor(numericValue, panel.thresholds)
    : undefined;

  const valueStyle = useMemo(() => ({
    fontSize: `${String(textSize)}px`,
    color: colorMode === 'value' && thresholdColor !== undefined ? thresholdColor : undefined,
  }), [textSize, colorMode, thresholdColor]);

  const bgStyle = useMemo(() => {
    if (colorMode !== 'background' || thresholdColor === undefined) return;
    return { backgroundColor: thresholdColor, color: 'white' };
  }, [colorMode, thresholdColor]);

  return (
    <PanelFrame
      title={panel.title}
      loading={isLoading}
      error={error instanceof Error ? error.message : null}
      onRetry={() => { void refetch(); }}
    >
      <div
        className='flex h-full items-center justify-center rounded'
        style={bgStyle}
        role='status'
        aria-label={`${panel.title}: ${value ?? 'no data'}`}
      >
        <span className='font-semibold tabular-nums' style={valueStyle}>
          {value ?? '—'}
        </span>
      </div>
    </PanelFrame>
  );
};
