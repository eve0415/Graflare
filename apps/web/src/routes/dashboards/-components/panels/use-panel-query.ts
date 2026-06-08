import type { PanelDataResult } from './use-panel-data';
import type { Panel } from '@graflare/shared/schemas/panel';

import { useCallback } from 'react';

import { usePanelData } from './use-panel-data';

interface TimeRange {
  from: string;
  to: string;
}

interface PanelQueryResult {
  data: PanelDataResult[] | null | undefined;
  isLoading: boolean;
  error: unknown;
  handleRetry: () => void;
}

// Thin wrapper every data panel shares: pulls the datasource/queries off the panel,
// runs the data query, and pre-binds the retry callback so each panel doesn't repeat
// the same `useCallback(() => void refetch(), [refetch])` boilerplate.
export const usePanelQuery = (panel: Panel, timeRange: TimeRange, refetchInterval: number | false): PanelQueryResult => {
  const { data, isLoading, error, refetch } = usePanelData(panel.datasourceId, panel.queries, timeRange, refetchInterval);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, handleRetry };
};
