import type { PanelQuery } from '@graflare/shared/schemas/panel';

import { useQuery } from '@tanstack/react-query';

import { proxyQuery } from '../../lib/api';

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

export const usePanelData = (
  datasourceId: string | undefined,
  queries: PanelQuery[],
  timeRange: TimeRange,
  refetchInterval: number | false,
) =>
  useQuery({
    queryKey: ['panel-data', datasourceId, queries, timeRange],
    queryFn: async () => {
      if (datasourceId === undefined || queries.length === 0) return null;

      const step = computeStep(timeRange.from, timeRange.to);
      const results = await Promise.all(
        queries.map(q =>
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

      return results;
    },
    enabled: datasourceId !== undefined && queries.length > 0,
    refetchInterval,
  });
