import type { PanelQuery } from '@graflare/shared/schemas/panel';
import type { PrometheusResponse } from '@graflare/shared/schemas/prometheus';
import type { SqlResponse } from '@graflare/shared/schemas/sql';

import { sqlRowsToSeries } from '@graflare/shared/sql/adapters';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { DatasourceRow } from '../../../datasources/-api';

import { proxyQuery } from '../../../../lib/proxy';
import { sqlQuery } from '../../../../lib/sql-proxy';

interface TimeRange {
  from: string;
  to: string;
}

const resolveTime = (expr: string): string => {
  if (expr === 'now') return String(Date.now() / 1000);
  const match = /^now-(\d+)([smhdw])$/.exec(expr);
  if (match === null) return expr;
  const [, amount, unit] = match;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const seconds = Number(amount) * (multipliers[unit] ?? 1);
  return String((Date.now() - seconds * 1000) / 1000);
};

const computeStep = (fromStr: string, toStr: string): string => {
  const from = Number(resolveTime(fromStr));
  const to = Number(resolveTime(toStr));
  const duration = Math.max(1, to - from);
  const step = Math.max(1, Math.floor(duration / 250));
  return `${String(step)}s`;
};

const executePrometheusQueries = async (
  datasourceId: string,
  queries: PanelQuery[],
  timeRange: TimeRange,
): Promise<PrometheusResponse[]> => {
  const step = computeStep(timeRange.from, timeRange.to);
  return Promise.all(
    queries.map((q) =>
      proxyQuery({
        data: {
          datasourceId,
          endpoint: '/api/v1/query_range',
          params: {
            query: q.expr,
            start: resolveTime(timeRange.from),
            end: resolveTime(timeRange.to),
            step,
          },
        },
      }),
    ),
  );
};

const executeSqlQueries = async (
  datasourceId: string,
  queries: PanelQuery[],
  timeRange: TimeRange,
): Promise<(PrometheusResponse | SqlResponse)[]> =>
  Promise.all(
    queries.map(async (q) => {
      const result = await sqlQuery({
        data: {
          datasourceId,
          rawSql: q.expr,
          format: q.format,
          timeRange: {
            from: resolveTime(timeRange.from),
            to: resolveTime(timeRange.to),
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

export const usePanelData = (
  datasourceId: string | undefined,
  queries: PanelQuery[],
  timeRange: TimeRange,
  refetchInterval: number | false,
) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['panel-data', datasourceId, queries, timeRange],
    queryFn: async (): Promise<PanelDataResult[] | null> => {
      if (datasourceId === undefined || queries.length === 0) return null;

      const datasources = queryClient.getQueryData<DatasourceRow[]>(['datasources']);
      const ds = datasources?.find((d) => d.id === datasourceId);
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
