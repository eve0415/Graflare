import type { QueryEditorMode } from '../../-root/query-editor-shell';
import type { MergeInput, MergedChartData } from './explore-series-merge';
import type { QueryHistoryEntry } from './query-history-store';
import type { DatasourceDialect } from '@graflare/shared/schemas/datasource';
import type { PrometheusData } from '@graflare/shared/schemas/prometheus';
import type { SqlResponse } from '@graflare/shared/schemas/sql';
import type { Options as UPlotOptions } from 'uplot';

import { sqlRowsToSeries } from '@graflare/shared/sql/adapters';
import { computeStep, resolveTime } from '@graflare/shared/time/resolve';
import { Button } from '@graflare/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { BarChart3, History, Play, Plus, Table2 } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

import { databaseSchemaQueryOptions } from '../../-root/introspection-queries';
import { QueryResultTable, formatPrometheusToTable } from '../../-root/query-result-table';
import { UPlotChart } from '../../-root/uplot-chart';
import { proxyQuery } from '../../../lib/proxy';
import { sqlQuery } from '../../../lib/sql-proxy';
import { datasourcesQueryOptions } from '../../datasources/-queries';

import { ExploreQueryRow } from './explore-query-row';
import { mergeSeries } from './explore-series-merge';
import { QueryHistoryDrawer } from './query-history-drawer';
import { useQueryHistory } from './use-query-history';

interface TimeRange {
  from: string;
  to: string;
}

type SqlFormat = 'time_series' | 'table';

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

/** Full parsed Prometheus matrix/vector series — carries `values` (range) and `value` (instant). */
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

/** One row's run outcome, discriminated so the post-run partition narrows without casts. */
type RunOutcome =
  | { kind: 'series'; refId: string; series: PrometheusSeries[] }
  | { kind: 'table'; refId: string; result: SqlResponse }
  | { kind: 'error'; refId: string; error: string };

/** A successful SQL `table`-format result tagged with its row's ref id (stacked when >1). */
interface TableResult {
  refId: string;
  result: SqlResponse;
}

/** Positional label for a row: A, B, C, … by index. */
const refIdFor = (index: number): string => String.fromCodePoint(65 + index);

const newRow = (seed?: { draft: string; mode: QueryEditorMode }): QueryRowEntry =>
  seed === undefined ? { id: crypto.randomUUID(), query: '' } : { id: crypto.randomUUID(), query: seed.draft, seedDraft: seed.draft, seedMode: seed.mode };

/**
 * One SQL `table`-format result rendered as a table, optionally headed by its ref-id label
 * (shown only when more than one query ran). A leaf so the table-data object is built here from
 * the `result` prop rather than created inline in the parent's render map (react-perf).
 */
const StackedSqlTable = ({ refId, result, showLabel }: { refId: string; result: SqlResponse; showLabel: boolean }) => {
  const data = useMemo(
    () => ({
      columns: result.columns.map(c => c.name),
      rows: result.rows.map(row => row.map(v => (v === null ? '' : String(v)))),
    }),
    [result],
  );
  return (
    <div className='space-y-1'>
      {showLabel && <span className='text-muted-foreground text-xs font-medium'>Query {refId}</span>}
      <QueryResultTable data={data} />
    </div>
  );
};

/** Pull the typed metric+sample series out of a Prometheus query-range/SQL-adapted response. */
const parsePrometheusSeries = (data: PrometheusData | undefined): PrometheusSeries[] => {
  if (data === undefined || !('resultType' in data) || !Array.isArray(data.result)) return [];
  const parsed: PrometheusSeries[] = [];
  for (const item of data.result) {
    // `result` may be a bare scalar sample tuple ([number, string]); skip those — only metric
    // series have a `metric`. matrix items carry `values`; vector items carry `value`.
    if (typeof item !== 'object' || !('metric' in item)) continue;
    if ('values' in item) {
      parsed.push({ metric: item.metric, values: item.values });
    } else {
      parsed.push({ metric: item.metric, value: item.value });
    }
  }
  return parsed;
};

export const ExplorePane = ({ timeRange, label }: ExplorePaneProps) => {
  const { data: datasources } = useSuspenseQuery(datasourcesQueryOptions());
  const dsItems = useMemo(() => datasources.map(ds => ({ value: ds.id, label: ds.name })), [datasources]);

  const [datasourceId, setDatasourceId] = useState<string>(datasources[0]?.id ?? '');
  const [rows, setRows] = useState<QueryRowEntry[]>(() => [newRow()]);

  const [resultView, setResultView] = useState<ResultView>('graph');
  const [sqlFormat, setSqlFormat] = useState<SqlFormat>('time_series');
  // Combined series across all run rows (graph + the prometheus-style table both derive from it).
  const [seriesResult, setSeriesResult] = useState<PrometheusSeries[] | null>(null);
  // SQL `table`-format results, one per run row (stacked in the table view).
  const [tableResults, setTableResults] = useState<TableResult[] | null>(null);
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
  // update keeps this callback dependency-free so it never churns (react-perf) and one shared
  // instance is passed to every row (no per-row closures in the render map).
  const handleRowChange = useCallback((id: string, query: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, query } : r)));
  }, []);

  const handleRemoveRow = useCallback((id: string) => {
    // Min one row; the remove affordance is hidden on the last row, but guard anyway.
    setRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));
  }, []);

  const handleAddRow = useCallback(() => {
    setRows(prev => [...prev, newRow()]);
  }, []);

  /** Run one row's query, returning a tagged outcome (never throws; errors are tagged). */
  const runOne = useCallback(
    async (refId: string, dsId: string, query: string, runIsSql: boolean, runSqlFormat: SqlFormat): Promise<RunOutcome> => {
      try {
        if (runIsSql) {
          const result = await sqlQuery({
            data: {
              datasourceId: dsId,
              rawSql: query,
              format: runSqlFormat,
              timeRange: { from: String(resolveTime(timeRange.from)), to: String(resolveTime(timeRange.to)) },
            },
          });
          if (result.error !== undefined) return { kind: 'error', refId, error: result.error };
          if (runSqlFormat === 'table') return { kind: 'table', refId, result };

          const adapted = sqlRowsToSeries(result);
          if (adapted.status === 'error') return { kind: 'error', refId, error: adapted.error ?? 'Failed to convert to series' };
          return { kind: 'series', refId, series: parsePrometheusSeries(adapted.data) };
        }

        const step = computeStep(timeRange.from, timeRange.to);
        const result = await proxyQuery({
          data: {
            datasourceId: dsId,
            endpoint: '/api/v1/query_range',
            params: { query, start: String(resolveTime(timeRange.from)), end: String(resolveTime(timeRange.to)), step },
          },
        });
        if (result.status === 'error') return { kind: 'error', refId, error: result.error ?? 'Query failed' };
        return { kind: 'series', refId, series: parsePrometheusSeries(result.data) };
      } catch (error) {
        return { kind: 'error', refId, error: error instanceof Error ? error.message : 'Query failed' };
      }
    },
    [timeRange],
  );

  // The single run path for both the Run button and a history re-run, so the two can never
  // drift. Queries are run CONCURRENTLY; each is tagged with its ref id. After all settle we do
  // ONE commit: merged successes + a combined error listing any failed ref ids, so a partial
  // failure still shows the rows that succeeded. History is recorded per successful query.
  const runQueries = useCallback(
    (args: { datasourceId: string; isSql: boolean; sqlFormat: SqlFormat; queries: { refId: string; query: string }[] }) => {
      const { datasourceId: dsId, isSql: runIsSql, sqlFormat: runSqlFormat, queries } = args;
      const runnable = queries.filter(q => q.query.trim() !== '');
      if (dsId === '' || runnable.length === 0) return;

      const run = async () => {
        setLoading(true);
        setQueryError(null);
        setSeriesResult(null);
        setTableResults(null);

        try {
          const outcomes = await Promise.all(runnable.map(q => runOne(q.refId, dsId, q.query, runIsSql, runSqlFormat)));

          const combinedSeries: PrometheusSeries[] = [];
          const tables: TableResult[] = [];
          const failures: { refId: string; error: string }[] = [];
          let successCount = 0;

          for (const outcome of outcomes) {
            switch (outcome.kind) {
              case 'series':
                // Tag each series with its ref id (reserved metric key) so the merge can group
                // and label per query; the table strips it and only surfaces it when >1 query ran.
                for (const s of outcome.series) combinedSeries.push({ ...s, metric: { __refId__: outcome.refId, ...s.metric } });
                successCount++;
                break;
              case 'table':
                tables.push({ refId: outcome.refId, result: outcome.result });
                successCount++;
                break;
              case 'error':
                failures.push({ refId: outcome.refId, error: outcome.error });
                break;
            }
          }

          // Record each non-empty query that ran without erroring (table or series both count).
          const failedSet = new Set(failures.map(f => f.refId));
          for (const q of runnable) {
            if (!failedSet.has(q.refId)) {
              record({ datasourceId: dsId, datasourceType: runIsSql ? 'sql' : 'prometheus', query: q.query });
            }
          }

          // Only render the result chrome when something succeeded, so an all-failed run shows the
          // error alone (not an empty "0 series" header). Successes + a combined error coexist.
          if (successCount > 0) {
            if (runIsSql && runSqlFormat === 'table') {
              setTableResults(tables);
            } else {
              setSeriesResult(combinedSeries);
            }
          }
          if (failures.length > 0) {
            // Keep each failure's real message (parse errors etc.) and prefix it with its ref id.
            const sorted = [...failures].sort((a, b) => a.refId.localeCompare(b.refId));
            setQueryError(sorted.map(f => `${f.refId}: ${f.error}`).join('; '));
          }
        } catch (error) {
          setQueryError(error instanceof Error ? error.message : 'Query failed');
        } finally {
          setLoading(false);
        }
      };
      void run();
    },
    [runOne, record],
  );

  const handleRun = useCallback(() => {
    runQueries({
      datasourceId,
      isSql,
      sqlFormat,
      queries: rows.map((r, i) => ({ refId: refIdFor(i), query: r.query })),
    });
  }, [runQueries, datasourceId, isSql, sqlFormat, rows]);

  const handleHistoryRun = useCallback(
    (entry: QueryHistoryEntry) => {
      const entryIsSql = entry.datasourceType === 'sql';
      // Restore the editor UI for display only; the run uses the entry's own values directly.
      // A history re-run collapses to a single row remounted (fresh id) with the entry seeded
      // into code mode — the simplest correct behavior (it replaces, rather than appends to, the
      // current rows). The run uses the entry's datasource/type explicitly to avoid reading the
      // datasource state we just set (setState is async).
      if (datasources.some(d => d.id === entry.datasourceId)) {
        setDatasourceId(entry.datasourceId);
      }
      setRows([newRow({ draft: entry.query, mode: 'code' })]);
      setHistoryOpen(false);
      runQueries({ datasourceId: entry.datasourceId, isSql: entryIsSql, sqlFormat, queries: [{ refId: refIdFor(0), query: entry.query }] });
    },
    [runQueries, datasources, sqlFormat],
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

  // Graph data + labels come from ONE merge pass so the stroke-series count can't drift from the
  // value-array count. SQL-table results never reach here (they render as stacked tables).
  const mergeInputs = useMemo((): MergeInput[] => {
    if (seriesResult === null) return [];
    // Group the flat combined series back by their ref id (carried on a reserved metric key).
    const byRef = new Map<string, MergeInput>();
    const order: string[] = [];
    for (const s of seriesResult) {
      const refId = s.metric.__refId__ ?? '';
      let entry = byRef.get(refId);
      if (entry === undefined) {
        entry = { refId, series: [] };
        byRef.set(refId, entry);
        order.push(refId);
      }
      entry.series.push({ metric: s.metric, values: s.values });
    }
    return order.map(r => {
      const entry = byRef.get(r);
      return entry ?? { refId: r, series: [] };
    });
  }, [seriesResult]);

  const merged = useMemo(() => mergeSeries(mergeInputs), [mergeInputs]);

  const chartData = useMemo((): MergedChartData => merged.data, [merged]);

  const chartFallback = useMemo(() => <Skeleton className='h-72 w-full' />, []);

  const chartOptions = useMemo(
    (): UPlotOptions => ({
      width: 800,
      height: 300,
      series: [{}, ...merged.labels.map((labelText, i) => ({ label: labelText, stroke: `hsl(${String(i * 60)}, 70%, 50%)` }))],
    }),
    [merged],
  );

  // The table view. SQL-table results stack one table per ref id; otherwise the combined series
  // feed the existing prometheus formatter. The ref-id `Query` column appears only when more than
  // one query contributed, so a single query's table is byte-identical to the old behavior.
  const seriesTableData = useMemo(() => {
    if (seriesResult === null) return { columns: [], rows: [] };
    const refIds = new Set<string>();
    for (const s of seriesResult) refIds.add(s.metric.__refId__ ?? '');
    const multi = refIds.size > 1;
    // Strip the reserved key; only surface a `Query` column when >1 query contributed.
    const forTable: PrometheusSeries[] = seriesResult.map(s => {
      const metric: Record<string, string> = {};
      if (multi) metric.Query = s.metric.__refId__ ?? '';
      for (const [k, v] of Object.entries(s.metric)) {
        if (k !== '__refId__') metric[k] = v;
      }
      const out: PrometheusSeries = { metric };
      if (s.values !== undefined) out.values = s.values;
      if (s.value !== undefined) out.value = s.value;
      return out;
    });
    return formatPrometheusToTable(forTable);
  }, [seriesResult]);

  const hasResults = seriesResult !== null || tableResults !== null;
  const resultCount = useMemo(() => {
    if (tableResults !== null) {
      let total = 0;
      for (const t of tableResults) total += t.result.rows.length;
      return total;
    }
    return seriesResult?.length ?? 0;
  }, [seriesResult, tableResults]);

  const canRemove = rows.length > 1;

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

      <div className='space-y-2'>
        {rows.map((row, i) => (
          <ExploreQueryRow
            key={row.id}
            id={row.id}
            refId={refIdFor(i)}
            datasourceId={datasourceId}
            isSql={isSql}
            dialect={selectedDialect}
            schema={codeEditorSchema}
            initialDraft={row.seedDraft}
            initialMode={row.seedMode}
            onChange={handleRowChange}
            onRun={handleRun}
            onRemove={canRemove ? handleRemoveRow : undefined}
          />
        ))}

        <Button
          variant='ghost'
          size='sm'
          className='border-border/60 text-muted-foreground hover:text-foreground w-full justify-center border border-dashed'
          onClick={handleAddRow}
          disabled={datasourceId === ''}
          aria-label='Add query'
        >
          <Plus data-icon='inline-start' />
          Add query
        </Button>
      </div>

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

      {hasResults && !loading && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' size='xs' onClick={toggleView} aria-label={`Switch to ${resultView === 'graph' ? 'table' : 'graph'} view`}>
              {resultView === 'graph' ? <Table2 className='h-4 w-4' /> : <BarChart3 className='h-4 w-4' />}
            </Button>
            <span className='text-muted-foreground text-xs'>
              {tableResults === null ? `${String(resultCount)} series` : `${String(resultCount)} rows`}, {resultView} view
            </span>
          </div>

          {resultView === 'graph' && tableResults === null && chartData[0] !== undefined && chartData[0].length > 0 && (
            <Suspense fallback={chartFallback}>
              <UPlotChart options={chartOptions} data={chartData} className='w-full' />
            </Suspense>
          )}

          {resultView === 'graph' && tableResults !== null && (
            <p className='text-muted-foreground text-sm'>Table format has no graph view. Switch the result view to see the rows.</p>
          )}

          {resultView === 'table' && tableResults === null && <QueryResultTable data={seriesTableData} />}

          {resultView === 'table' &&
            tableResults !== null &&
            tableResults.map(t => <StackedSqlTable key={t.refId} refId={t.refId} result={t.result} showLabel={tableResults.length > 1} />)}
        </div>
      )}
    </div>
  );
};
