import type { PanelQuery } from '@graflare/shared/schemas/panel';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';
import type { SqlResponse } from '@graflare/shared/schemas/sql';

import { sqlRowsToSeries } from '@graflare/shared/sql/adapters';
import { computeStep, resolveTime } from '@graflare/shared/time/resolve';
import { useQuery } from '@tanstack/react-query';

import { proxyQuery } from '../../../../lib/proxy';
import { sqlQuery } from '../../../../lib/sql-proxy';
import { datasourcesQueryOptions } from '../../../datasources/-queries';

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
  // Fetch the datasource list here rather than peeking the cache: on a direct load
  // or refresh of a dashboard nothing else primes ['datasources'] (only the Data
  // Sources route did), so a cache read returned undefined and every panel silently
  // showed "No data". The `enabled` gate below waits for this to resolve.
  const { data: datasources } = useQuery(datasourcesQueryOptions());

  return useQuery({
    queryKey: ['panel-data', datasourceId, queries, timeRange],
    queryFn: async (): Promise<PanelDataResult[] | null> => {
      if (datasourceId === undefined || queries.length === 0) return null;

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
    // Wait for the datasource list before running so the lookup is reliable: once it
    // loads, `datasources` flips from undefined to defined and the query enables.
    enabled: datasourceId !== undefined && queries.length > 0 && datasources !== undefined,
    refetchInterval,
    refetchIntervalInBackground: false,
  });
};
