import type { DatasourceRow } from '../../../datasources/-api';
import type { PanelQuery } from '@graflare/shared/schemas/panel';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';
import type { SqlResponse } from '@graflare/shared/schemas/sql';

import { sqlRowsToSeries } from '@graflare/shared/sql/adapters';
import { computeStep, resolveTime } from '@graflare/shared/time/resolve';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { proxyQuery } from '../../../../lib/proxy';
import { sqlQuery } from '../../../../lib/sql-proxy';

interface TimeRange {
  from: string;
  to: string;
}

const executePrometheusQueries = async (datasourceId: string, queries: PanelQuery[], timeRange: TimeRange): Promise<PrometheusResponse[]> => {
  const step = computeStep(timeRange.from, timeRange.to);
  return Promise.all(
    queries.map(q =>
      proxyQuery({
        data: {
          datasourceId,
          endpoint: '/api/v1/query_range',
          params: {
            query: q.expr,
            start: String(resolveTime(timeRange.from)),
            end: String(resolveTime(timeRange.to)),
            step,
          },
        },
      }),
    ),
  );
};

const executeSqlQueries = async (datasourceId: string, queries: PanelQuery[], timeRange: TimeRange): Promise<(PrometheusResponse | SqlResponse)[]> =>
  Promise.all(
    queries.map(async q => {
      const result = await sqlQuery({
        data: {
          datasourceId,
          rawSql: q.expr,
          format: q.format,
          timeRange: {
            from: String(resolveTime(timeRange.from)),
            to: String(resolveTime(timeRange.to)),
          },
        },
      });

      if (q.format === 'time_series') {
        return sqlRowsToSeries(result);
      }
      return result;
    }),
  );

export type PanelDataResult = PrometheusResponse | SqlResponse;

export const usePanelData = (datasourceId: string | undefined, queries: PanelQuery[], timeRange: TimeRange, refetchInterval: number | false) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['panel-data', datasourceId, queries, timeRange],
    queryFn: async (): Promise<PanelDataResult[] | null> => {
      if (datasourceId === undefined || queries.length === 0) return null;

      const datasources = queryClient.getQueryData<DatasourceRow[]>(['datasources']);
      const ds = datasources?.find(d => d.id === datasourceId);
      if (ds === undefined) {
        return [{ status: 'error', errorType: 'internal', error: 'Data source not loaded' }];
      }
      const dsType = ds.type;

      if (dsType === 'sql') {
        return executeSqlQueries(datasourceId, queries, timeRange);
      }

      return executePrometheusQueries(datasourceId, queries, timeRange);
    },
    enabled: datasourceId !== undefined && queries.length > 0,
    refetchInterval,
    refetchIntervalInBackground: false,
  });
};
