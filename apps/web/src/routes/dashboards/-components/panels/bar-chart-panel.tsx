import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';
import { seriesLabel } from '@graflare/shared/legend/resolve';
import { resolveRange } from '@graflare/shared/time/resolve';
import { useMemo } from 'react';

import { chartThemeColors } from '../../../-root/chart-theme';
import { useTheme } from '../../../-root/theme-provider';

import { annotationMarkers } from './annotations-plugin';
import { barChartAlignedData, buildBarChartOptions } from './bar-chart-data';
import { extractTransformedSeriesWithQuery, seriesDescriptor } from './panel-data-extract';
import { PanelDataTable } from './panel-data-table';
import { UPlotPanel } from './uplot-panel';
import { usePanelQuery } from './use-panel-query';

interface BarChartPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
  width: number;
  height: number;
  annotations: readonly Annotation[];
}

export const BarChartPanel = ({ panel, timeRange, refetchInterval, width, height, annotations }: BarChartPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);
  const { resolved } = useTheme();

  // Extract + transform ONCE, then derive bars, labels, and configs from this single array so all
  // three stay index-aligned (a per-extraction transform would desync bars from their labels/configs
  // — the failure the transform pipeline must avoid). With no transformations this is the same
  // refId-tagged series the panel extracted before; with transformations, refId is dropped (the
  // structural ops sever the series↔query link), so byFrameRefID/legendFormat fall back to the
  // metric-derived label — the documented post-transform behavior.
  const queried = useMemo(() => extractTransformedSeriesWithQuery(data, panel.queries, panel.transformations), [data, panel.queries, panel.transformations]);
  const series = useMemo(() => queried.map(q => q.series), [queried]);
  const chartData = useMemo(() => barChartAlignedData(series), [series]);

  // refId→legendFormat once, instead of an O(series × queries) find inside the map.
  const legendFormats = useMemo(() => new Map(panel.queries.map(q => [q.refId, q.legendFormat])), [panel.queries]);
  const labels = useMemo(
    () => queried.map((q, i) => seriesLabel(q.refId === undefined ? undefined : legendFormats.get(q.refId), q.series.metric, i)),
    [queried, legendFormats],
  );

  // Effective field config per series (unit/min/max), resolved against the panel overrides keyed on
  // the derived label + producing query refId — the same descriptor path the bar-gauge panel uses.
  // Index-aligned with `series`; `buildBarChartOptions` groups by the resolved unit into y-axes.
  // With no overrides every series resolves to the defaults reference → one y-axis, as before.
  const seriesConfigs = useMemo(
    () => queried.map((q, i) => resolveFieldConfig(seriesDescriptor(q.series, i, q.refId), panel.fieldConfig)),
    [queried, panel.fieldConfig],
  );

  // Resolve the visible window once (epoch seconds) — shared by the annotation markers and the
  // chart's x-axis range pin so both track the same `[from, to]`.
  const queryWindow = useMemo(() => resolveRange(timeRange.from, timeRange.to), [timeRange.from, timeRange.to]);

  const markers = useMemo(() => annotationMarkers(annotations, queryWindow.from, queryWindow.to), [annotations, queryWindow.from, queryWindow.to]);

  const chartOptions = useMemo(() => {
    const vertical = panel.displayOptions.barchart?.orientation !== 'horizontal';
    const colors = chartThemeColors(resolved);
    return buildBarChartOptions({
      series,
      labels,
      defaults: panel.fieldConfig.defaults,
      seriesConfigs,
      width,
      height,
      vertical,
      colors,
      range: [queryWindow.from, queryWindow.to],
    });
  }, [
    series,
    labels,
    seriesConfigs,
    panel.fieldConfig.defaults,
    panel.displayOptions.barchart?.orientation,
    width,
    height,
    resolved,
    queryWindow.from,
    queryWindow.to,
  ]);

  // A cheap element — PanelDataTable formats the series only when PanelFrame mounts it
  // (data-table toggle on), not on every refresh.
  const dataTable = useMemo(() => <PanelDataTable series={series} scrollRegionLabel={`${panel.title} data table`} />, [series, panel.title]);

  return (
    <UPlotPanel
      panel={panel}
      data={chartData}
      options={chartOptions}
      isLoading={isLoading}
      error={error}
      onRetry={handleRetry}
      dataTableContent={dataTable}
      annotationMarkers={markers}
    />
  );
};
