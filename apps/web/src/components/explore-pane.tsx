import { Button } from '@graflare/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { BarChart3, Play, Table2 } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

import { proxyQuery } from '../lib/proxy';
import { datasourcesQueryOptions } from '../routes/datasources/-queries';

import type { Options as UPlotOptions } from 'uplot';

import { PromQLEditor } from './promql-editor';
import { QueryResultTable, formatPrometheusToTable } from './query-result-table';
import { UPlotChart } from './uplot-chart';

interface TimeRange {
  from: string;
  to: string;
}

interface ExplorePaneProps {
  timeRange: TimeRange;
  label: string;
}

type ResultView = 'graph' | 'table';

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

export const ExplorePane = ({ timeRange, label }: ExplorePaneProps) => {
  const { data: datasources } = useSuspenseQuery(datasourcesQueryOptions());

  const [datasourceId, setDatasourceId] = useState<string>(datasources[0]?.id ?? '');
  const [queryExpr, setQueryExpr] = useState('');
  const [resultView, setResultView] = useState<ResultView>('graph');
  const [queryResult, setQueryResult] = useState<{
    resultType: string;
    result: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(() => {
    if (datasourceId === '' || queryExpr.trim() === '') return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const step = computeStep(timeRange.from, timeRange.to);
        const result = await proxyQuery({
          data: {
            datasourceId,
            endpoint: '/api/v1/query_range',
            params: {
              query: queryExpr,
              start: resolveTime(timeRange.from),
              end: resolveTime(timeRange.to),
              step,
            },
          },
        });

        if (result.status === 'error') {
          setError(result.error ?? 'Query failed');
          setQueryResult(null);
        } else if (result.data !== undefined && 'resultType' in result.data && Array.isArray(result.data.result)) {
          const parsed: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[] = [];
          for (const item of result.data.result) {
            if (typeof item === 'object' && item !== null && 'metric' in item) {
              parsed.push(item);
            }
          }
          setQueryResult({ resultType: result.data.resultType, result: parsed });
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Query failed');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [datasourceId, queryExpr, timeRange]);

  const handleDatasourceChange = useCallback((id: string) => {
    setDatasourceId(id);
  }, []);

  const toggleView = useCallback(() => {
    setResultView(v => (v === 'graph' ? 'table' : 'graph'));
  }, []);

  const tableData = useMemo(() => {
    if (queryResult === null) return { columns: [], rows: [] };
    return formatPrometheusToTable(queryResult.result);
  }, [queryResult]);

  const chartData = useMemo((): [number[], ...number[][]] => {
    if (queryResult === null || queryResult.result.length === 0) return [[]];

    const [firstSeries] = queryResult.result;
    if (firstSeries?.values === undefined) return [[]];

    const timestamps = firstSeries.values.map(v => v[0]);
    const series = queryResult.result.map(r =>
      (r.values ?? []).map(v => Number(v[1])),
    );

    return [timestamps, ...series];
  }, [queryResult]);

  const chartFallback = useMemo(() => <Skeleton className='h-72 w-full' />, []);

  const chartOptions = useMemo((): UPlotOptions => ({
    width: 800,
    height: 300,
    series: [
      {},
      ...(queryResult?.result ?? []).map((r, i) => ({
        label: r.metric.__name__ ?? `Series ${String(i + 1)}`,
        stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
      })),
    ],
  }), [queryResult]);

  return (
    <div className='space-y-3' aria-label={label}>
      <div className='flex items-center gap-2'>
        <Select value={datasourceId} onValueChange={handleDatasourceChange}>
          <SelectTrigger className='w-48' aria-label='Select data source'>
            <SelectValue placeholder='Data source' />
          </SelectTrigger>
          <SelectContent>
            {datasources.map(ds => (
              <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className='flex-1'>
          <PromQLEditor
            value={queryExpr}
            onChange={setQueryExpr}
            onRun={handleRun}
            placeholder='Enter a PromQL query...'
          />
        </div>

        <Button onClick={handleRun} disabled={loading || datasourceId === ''} size='sm'>
          <Play className='mr-1 h-3.5 w-3.5' />
          Run
        </Button>
      </div>

      {error !== null && (
        <div className='bg-destructive/10 text-destructive rounded-md p-3 text-sm' role='alert'>
          {error}
        </div>
      )}

      {loading && <Skeleton className='h-64 w-full' />}

      {queryResult !== null && !loading && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' size='xs' onClick={toggleView} aria-label={`Switch to ${resultView === 'graph' ? 'table' : 'graph'} view`}>
              {resultView === 'graph' ? <Table2 className='h-4 w-4' /> : <BarChart3 className='h-4 w-4' />}
            </Button>
            <span className='text-muted-foreground text-xs'>
              {queryResult.result.length} series, {resultView} view
            </span>
          </div>

          {resultView === 'graph' && chartData[0] !== undefined && chartData[0].length > 0 && (
            <Suspense fallback={chartFallback}>
              <UPlotChart options={chartOptions} data={chartData} className='w-full' />
            </Suspense>
          )}

          {resultView === 'table' && (
            <QueryResultTable data={tableData} />
          )}
        </div>
      )}
    </div>
  );
};
