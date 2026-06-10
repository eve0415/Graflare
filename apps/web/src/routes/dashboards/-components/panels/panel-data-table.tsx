import type { ResultSeries } from './panel-data-extract';

import { useMemo } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../../../-root/query-result-table';

// Leaf data-table view for a chart panel. PanelFrame mounts `dataTableContent` only while the
// data-table toggle is on, so doing the series→table formatting HERE (instead of eagerly in the
// panel) keeps it off the refresh hot path — the panel only creates a cheap element; the work
// runs when the table is actually shown.
export const PanelDataTable = ({ series, scrollRegionLabel }: { series: ResultSeries[]; scrollRegionLabel: string }) => {
  const data = useMemo(() => formatPrometheusToTable(series), [series]);
  return <QueryResultTable data={data} scrollRegionLabel={scrollRegionLabel} />;
};
