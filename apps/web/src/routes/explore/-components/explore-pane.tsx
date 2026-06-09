import type { QueryEditorMode } from '../../-root/query-editor-shell';
import type { QueryHistoryEntry } from './query-history-store';
import type { DatasourceDialect } from '@graflare/shared/schemas/datasource';
import type { SqlResponse } from '@graflare/shared/schemas/sql';
import type { Options as UPlotOptions } from 'uplot';

import { sqlRowsToSeries } from '@graflare/shared/sql/adapters';
import { computeStep, resolveTime } from '@graflare/shared/time/resolve';
import { Button } from '@graflare/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { BarChart3, History, Play, Table2 } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

import { databaseSchemaQueryOptions } from '../../-root/introspection-queries';
import { QueryResultTable, formatPrometheusToTable } from '../../-root/query-result-table';
import { UPlotChart } from '../../-root/uplot-chart';
import { proxyQuery } from '../../../lib/proxy';
import { sqlQuery } from '../../../lib/sql-proxy';
import { datasourcesQueryOptions } from '../../datasources/-queries';

import { ExploreQueryRow } from './explore-query-row';
import { QueryHistoryDrawer } from './query-history-drawer';
import { useQueryHistory } from './use-query-history';

interface TimeRange {
  from: string;
  to: string;
}

const SQL_FORMAT_OPTIONS = [
  { value: 'time_series', label: 'Time series' },
  { value: 'table', label: 'Table' },
] as const;

interface ExplorePaneProps {
  timeRange: TimeRange;
  label: string;
}

type ResultView = 'graph' | 'table';

const VALID_DIALECTS = new Set<string>(['postgres', 'sqlite']);

const isValidDialect = (value: string | null | undefined): value is DatasourceDialect => typeof value === 'string' && VALID_DIALECTS.has(value);

interface PrometheusSeries {
  metric: Record<string, string>;
  values?: [number, string][];
  value?: [number, string];
}

interface QueryRowEntry {
  /** Stable identity, also the React key + the row's `onChange` id. */
  id: string;
  /** The latest effective query reported up by this row. */
  query: string;
  /** Seed consumed once on (re)mount; a history re-run mints a new id with a seed. */
  seedDraft?: string;
  seedMode?: QueryEditorMode;
}

/** Positional label for a row: A, B, C, … by index. */
const refIdFor = (index: number): string => String.fromCodePoint(65 + index);

const newRow = (seed?: { draft: string; mode: QueryEditorMode }): QueryRowEntry =>
  seed === undefined ? { id: crypto.randomUUID(), query: '' } : { id: crypto.randomUUID(), query: '', seedDraft: seed.draft, seedMode: seed.mode };

export const ExplorePane = ({ timeRange, label }: ExplorePaneProps) => {
  const { data: datasources } = useSuspenseQuery(datasourcesQueryOptions());
  const dsItems = useMemo(() => datasources.map(ds => ({ value: ds.id, label: ds.name })), [datasources]);

  const [datasourceId, setDatasourceId] = useState<string>(datasources[0]?.id ?? '');
  const [rows, setRows] = useState<QueryRowEntry[]>(() => [newRow()]);

  const [resultView, setResultView] = useState<ResultView>('graph');
  const [sqlFormat, setSqlFormat] = useState<'time_series' | 'table'>('time_series');
  const [queryResult, setQueryResult] = useState<{ resultType: string; result: PrometheusSeries[] } | null>(null);
  const [sqlTableResult, setSqlTableResult] = useState<SqlResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Reference clock for the drawer's relative timestamps, re-seeded when the drawer opens (in the
  // open handler — an event, so no render-phase clock read or setState-in-effect).
  const [historyNow, setHistoryNow] = useState(() => Date.now());

  const { entries: historyEntries, record, toggleStar, setComment, remove } = useQueryHistory();

  const selectedDs = datasources.find(d => d.id === datasourceId);
  const isSql = selectedDs?.type === 'sql';

  const dbSchemaQuery = useQuery(databaseSchemaQueryOptions(isSql ? datasourceId : ''));
  const codeEditorSchema = useMemo(() => {
    if (!isSql || dbSchemaQuery.data === undefined) return;
    return dbSchemaQuery.data.tables;
  }, [isSql, dbSchemaQuery.data]);

  const selectedDialect = useMemo((): DatasourceDialect | undefined => {
    const d = selectedDs?.dialect;
    return isValidDialect(d) ? d : undefined;
  }, [selectedDs?.dialect]);

  // A row reports its effective query here; we store it on the matching row by id. Functional
  // update keeps this callback dependency-free so it never churns (react-perf) and the rows
  // array identity stays stable across rows.
  const handleRowChange = useCallback((id: string, query: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, query } : r)));
  }, []);

  // Core runner: takes the datasource/query/dialect explicitly so a history re-run can run a
  // restored query without waiting for the state it just set (setState is async, so reading
  // back in the same tick would be stale). History is recorded only on a successful run, tracked
  // by a local `ok` flag — `queryError` is set inside this async closure and can't be read
  // synchronously after it.
  const runQuery = useCallback(
    (args: { datasourceId: string; query: string; isSql: boolean }) => {
      const { datasourceId: dsId, query, isSql: runIsSql } = args;
      if (dsId === '' || query.trim() === '') return;

      const run = async () => {
        setLoading(true);
        setQueryError(null);
        setQueryResult(null);
        setSqlTableResult(null);
        let ok = false;

        try {
          if (runIsSql) {
            const result = await sqlQuery({
              data: {
                datasourceId: dsId,
                rawSql: query,
                format: sqlFormat,
                timeRange: {
                  from: String(resolveTime(timeRange.from)),
                  to: String(resolveTime(timeRange.to)),
                },
              },
            });

            if (result.error !== undefined) {
              setQueryError(result.error);
            } else if (sqlFormat === 'table') {
              setSqlTableResult(result);
              ok = true;
            } else {
              const adapted = sqlRowsToSeries(result);
              if (adapted.status === 'error') {
                setQueryError(adapted.error ?? 'Failed to convert to series');
              } else if (adapted.data !== undefined && 'result' in adapted.data && Array.isArray(adapted.data.result)) {
                const parsed: PrometheusSeries[] = [];
                for (const item of adapted.data.result) {
                  if (typeof item === 'object' && item !== null && 'metric' in item) {
                    parsed.push(item);
                  }
                }
                setQueryResult({ resultType: adapted.data.resultType, result: parsed });
                ok = true;
              }
            }
          } else {
            const step = computeStep(timeRange.from, timeRange.to);
            const result = await proxyQuery({
              data: {
                datasourceId: dsId,
                endpoint: '/api/v1/query_range',
                params: {
                  query,
                  start: String(resolveTime(timeRange.from)),
                  end: String(resolveTime(timeRange.to)),
                  step,
                },
              },
            });

            if (result.status === 'error') {
              setQueryError(result.error ?? 'Query failed');
            } else if (result.data !== undefined && 'resultType' in result.data && Array.isArray(result.data.result)) {
              const parsed: PrometheusSeries[] = [];
              for (const item of result.data.result) {
                if (typeof item === 'object' && item !== null && 'metric' in item) {
                  parsed.push(item);
                }
              }
              setQueryResult({ resultType: result.data.resultType, result: parsed });
              ok = true;
            }
          }

          if (ok) {
            record({ datasourceId: dsId, datasourceType: runIsSql ? 'sql' : 'prometheus', query });
          }
        } catch (error) {
          setQueryError(error instanceof Error ? error.message : 'Query failed');
        } finally {
          setLoading(false);
        }
      };
      void run();
    },
    [timeRange, sqlFormat, record],
  );

  const handleRun = useCallback(() => {
    const [firstRow] = rows;
    if (firstRow === undefined) return;
    runQuery({ datasourceId, query: firstRow.query, isSql });
  }, [runQuery, datasourceId, rows, isSql]);

  const handleHistoryRun = useCallback(
    (entry: QueryHistoryEntry) => {
      const entryIsSql = entry.datasourceType === 'sql';
      // Restore the editor UI for display only; the run uses the entry's own values directly.
      // Collapse to a single row remounted (fresh id) with the entry seeded into code mode.
      if (datasources.some(d => d.id === entry.datasourceId)) {
        setDatasourceId(entry.datasourceId);
      }
      setRows([newRow({ draft: entry.query, mode: 'code' })]);
      setHistoryOpen(false);
      runQuery({ datasourceId: entry.datasourceId, query: entry.query, isSql: entryIsSql });
    },
    [runQuery, datasources],
  );

  const openHistory = useCallback(() => {
    setHistoryNow(Date.now());
    setHistoryOpen(true);
  }, []);

  const handleDatasourceChange = useCallback((id: string | null) => {
    if (id === null) return;
    setDatasourceId(id);
    // New data source means a new query language; reset to a single fresh row.
    setRows([newRow()]);
  }, []);

  const handleSqlFormatChange = useCallback((v: string | null) => {
    if (v === 'time_series' || v === 'table') {
      setSqlFormat(v);
    }
  }, []);

  const toggleView = useCallback(() => {
    setResultView(v => (v === 'graph' ? 'table' : 'graph'));
  }, []);

  const tableData = useMemo(() => {
    if (sqlTableResult !== null) {
      return {
        columns: sqlTableResult.columns.map(c => c.name),
        rows: sqlTableResult.rows.map(row => row.map(v => (v === null ? '' : String(v)))),
      };
    }
    if (queryResult === null) return { columns: [], rows: [] };
    return formatPrometheusToTable(queryResult.result);
  }, [queryResult, sqlTableResult]);

  const chartData = useMemo((): [number[], ...number[][]] => {
    if (queryResult === null || queryResult.result.length === 0) return [[]];

    const [firstSeries] = queryResult.result;
    if (firstSeries?.values === undefined) return [[]];

    const timestamps = firstSeries.values.map(v => v[0]);
    const series = queryResult.result.map(r => (r.values ?? []).map(v => Number(v[1])));

    return [timestamps, ...series];
  }, [queryResult]);

  const chartFallback = useMemo(() => <Skeleton className='h-72 w-full' />, []);

  const chartOptions = useMemo(
    (): UPlotOptions => ({
      width: 800,
      height: 300,
      series: [
        {},
        ...(queryResult?.result ?? []).map((r, i) => ({
          label: r.metric.__name__ ?? `Series ${String(i + 1)}`,
          stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
        })),
      ],
    }),
    [queryResult],
  );

  const [onlyRow] = rows;

  return (
    <div className='space-y-3' aria-label={label}>
      <div className='flex items-center gap-2'>
        <Select value={datasourceId} onValueChange={handleDatasourceChange} items={dsItems}>
          <SelectTrigger className='w-48' aria-label='Select data source'>
            <SelectValue placeholder='Data source' />
          </SelectTrigger>
          <SelectContent>
            {dsItems.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isSql && (
          <Select value={sqlFormat} onValueChange={handleSqlFormatChange} items={SQL_FORMAT_OPTIONS}>
            <SelectTrigger className='w-32' aria-label='SQL format mode'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SQL_FORMAT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button onClick={handleRun} disabled={loading || datasourceId === ''} size='sm'>
          <Play className='mr-1 h-3.5 w-3.5' />
          Run
        </Button>

        <Button variant='ghost' size='icon-sm' onClick={openHistory} aria-label='Query history'>
          <History className='h-4 w-4' />
        </Button>
      </div>

      {onlyRow !== undefined && (
        <ExploreQueryRow
          key={onlyRow.id}
          id={onlyRow.id}
          refId={refIdFor(0)}
          datasourceId={datasourceId}
          isSql={isSql}
          dialect={selectedDialect}
          schema={codeEditorSchema}
          initialDraft={onlyRow.seedDraft}
          initialMode={onlyRow.seedMode}
          onChange={handleRowChange}
          onRun={handleRun}
        />
      )}

      <QueryHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entries={historyEntries}
        datasources={datasources}
        now={historyNow}
        onRun={handleHistoryRun}
        onToggleStar={toggleStar}
        onSetComment={setComment}
        onRemove={remove}
      />

      {queryError !== null && (
        <div className='bg-destructive/10 text-destructive rounded-md p-3 text-sm' role='alert'>
          {queryError}
        </div>
      )}

      {loading && <Skeleton className='h-64 w-full' />}

      {(queryResult !== null || sqlTableResult !== null) && !loading && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' size='xs' onClick={toggleView} aria-label={`Switch to ${resultView === 'graph' ? 'table' : 'graph'} view`}>
              {resultView === 'graph' ? <Table2 className='h-4 w-4' /> : <BarChart3 className='h-4 w-4' />}
            </Button>
            <span className='text-muted-foreground text-xs'>
              {sqlTableResult === null ? `${String(queryResult?.result.length ?? 0)} series` : `${String(sqlTableResult.rows.length)} rows`}, {resultView} view
            </span>
          </div>

          {resultView === 'graph' && chartData[0] !== undefined && chartData[0].length > 0 && (
            <Suspense fallback={chartFallback}>
              <UPlotChart options={chartOptions} data={chartData} className='w-full' />
            </Suspense>
          )}

          {resultView === 'table' && <QueryResultTable data={tableData} />}
        </div>
      )}
    </div>
  );
};
